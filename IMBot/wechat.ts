import { writeFileSync } from 'fs';
import {
    Wechaty,
    WechatyBuilder,
    Contact,
    Room,
    ScanStatus,
    Message as ChatyMessage,
} from 'wechaty';
import {
    generate as generateQRCode,
    setErrorLevel as setQRCodeErrorLevel
} from 'qrcode-terminal'
import {
    Participant,
    Thread,
    Channel,
    Message,
    Bot,
    BotEventType,
    EventCallback
} from './bot'

export interface WechatBotConfig {
    botName: string
    threadReclaimTimeout: number
    groupWhitelist: string[]
    userWhitelist: string[]
    loginQRCodePath: string
}

const DEFAULT_THREAD_NAME = "WechatDefaultThread"

class WechatParticipant implements Participant {
    contact: Contact;

    constructor(contact: Contact) {
        this.contact = contact;
    }

    id(): string {
        return this.contact.id;
    }

    name(): string {
        return this.contact.name()
    }

    isMyself(): boolean {
        return this.contact.self()
    }
}

class WechatThread implements Thread {
    name: string
    chan: WechatChannel
    parts: WechatParticipant[]
    lastActive: number

    constructor(name: string, channel: WechatChannel, participants: WechatParticipant[]) {
        this.name = name
        this.chan = channel
        this.parts = participants
        this.lastActive = Date.now()
    }

    id(): string {
        return this.name
    }

    channel(): Channel {
        return this.chan
    }

    participants(): Participant[] {
        return this.parts
    }

    updateLastActive(): void {
        this.lastActive = Date.now()
    }

    async send(content: string): Promise<void> {
        let mentions: string = "";

        if (this.name !== DEFAULT_THREAD_NAME) {
            for (let part of this.parts) {
                mentions += `@${part.name()} `
            }
        }

        await this.chan.send(`${mentions}${content}`)

        this.updateLastActive()
    }
}

class WechatChannel implements Channel {
    channel: Contact | Room;
    threadMap: Map<string, WechatThread>;
    threadTimeout: number
    parts: WechatParticipant[];

    constructor(channel: Contact | Room, threadTimeout: number, participants: WechatParticipant[]) {
        this.channel = channel;
        this.threadTimeout = threadTimeout;
        this.parts = participants;
        this.threadMap = new Map<string, WechatThread>;
        this.threadMap.set(DEFAULT_THREAD_NAME, new WechatThread(DEFAULT_THREAD_NAME, this, participants))
    }

    id(): string {
        return this.channel.id
    }

    participants(): Participant[] {
        return this.parts
    }

    findThread(name: string): Thread | undefined {
        return this.threadMap.get(name);
    }

    generateThreadName(participants: WechatParticipant[]): string {
        return participants.map((v: WechatParticipant) => {
            return v.id()
        }).join("|")
    }

    findOrAddThread(participants: WechatParticipant[]): WechatThread {
        if (participants.length == 0) {
            return this.threadMap.get(DEFAULT_THREAD_NAME)!
        }

        let thread = this.threadMap.get(this.generateThreadName(participants))

        if (!thread) {
            let name = this.generateThreadName(participants)
            thread = new WechatThread(name, this, participants)
            this.threadMap.set(name, thread)
        }

        return thread!
    }


    reclaim_threads(): void {
        this.threadMap.forEach((thread: WechatThread) => {
            if (Date.now() - thread.lastActive > this.threadTimeout) {
                this.threadMap.delete(thread.id())
            }
        })
    }

    async send(content: string): Promise<void> {
        await this.channel.say(content)
    }
}

class WechatMessage implements Message {
    t: WechatThread
    src: WechatParticipant
    ccs: WechatParticipant[]
    msg: string

    constructor(thread: WechatThread, src: WechatParticipant, ccs: WechatParticipant[], msg: string) {
        this.t = thread
        this.src = src
        this.ccs = ccs
        this.msg = msg
    }

    thread(): Thread {
        return this.t
    }

    from(): Participant {
        return this.src
    }

    cc(): Participant[] {
        return this.ccs
    }

    content(): string {
        return this.msg
    }
}

export class WechatBot implements Bot {
    private wechaty: Wechaty;
    private config: WechatBotConfig;
    private rooms: Map<string, WechatChannel>;
    private contacts: Map<string, WechatChannel>;
    private callbacks: Map<BotEventType, EventCallback[]>;

    constructor(config: WechatBotConfig) {
        this.config = config
        this.wechaty = WechatyBuilder.build({
            name: config.botName,
            puppet: "wechaty-puppet-wechat4u",
        })
        this.rooms = new Map<string, WechatChannel>
        this.contacts = new Map<string, WechatChannel>
        this.callbacks = new Map<BotEventType, EventCallback[]>
        this.callbacks.set(BotEventType.MessageEvent, [])

        this.wechaty.on('scan', (qrcode: string, status: ScanStatus) => this.handleScan(qrcode, status))
        this.wechaty.on('login', (user: Contact) => this.handleLogin(user))
        this.wechaty.on('logout', () => this.handleLogout())
        this.wechaty.on('message', (message: ChatyMessage) => this.handleMessage(message))
    }

    run(): Promise<void> {
        return this.wechaty.start();
    }

    stop(): void {
        this.wechaty.stop();
    }

    async findChannel(name: string): Promise<Channel | undefined> {
        let wechatyRoom = await this.wechaty.Room.find({ topic: name })

        if (!wechatyRoom) {
            return undefined
        }

        return this.rooms.get(wechatyRoom!.id)
    }

    async findDm(name: string): Promise<Channel | undefined> {
        let wechatyContact = await this.wechaty.Contact.find(name)

        if (!wechatyContact) {
            return undefined
        }

        return this.contacts.get(wechatyContact!.id)
    }

    on(ev: BotEventType, cb: EventCallback): void {
        this.callbacks.get(ev)!.push(cb);
    }

    handleScan(loginURL: string, status: ScanStatus): void {
        console.log(`[${new Date}] 'scan' event triggered`)
        if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
            setQRCodeErrorLevel("L")
            generateQRCode(loginURL, { small: true }, (qrcode: string) => {
                writeFileSync(this.config.loginQRCodePath, qrcode, { mode: 0o600, flag: "w+" })
                console.log(`[${new Date}] QR Code writted`)
            })
        }
    }

    async handleLogin(myself: Contact): Promise<void> {
        console.log(`[${new Date}] 'login' event triggered`)

        // build channle for myself
        let myselfChan = new WechatChannel(myself, this.config.threadReclaimTimeout, [new WechatParticipant(myself)])
        this.contacts.set(myselfChan.id(), myselfChan)

        // build channel from group whitelist
        for (let groupName of this.config.groupWhitelist) {
            let wechatyRoom = await this.wechaty.Room.find({ topic: groupName })

            if (wechatyRoom) {
                let participants = (await wechatyRoom!.memberAll()).map((v: Contact) => {
                    return new WechatParticipant(v)
                })
                let room = new WechatChannel(wechatyRoom, this.config.threadReclaimTimeout, participants)

                this.rooms.set(room.id(), room)

                console.log(`[${new Date}] 'room '${groupName}' with id '${room.id()}' added`)
            } else {
                console.warn(`[${new Date}] room '${groupName}' not found`)
            }
        }

        // build channel from user whitelist
        for (let userName of this.config.userWhitelist) {
            let wechatyContact = await this.wechaty.Contact.find(userName)

            if (wechatyContact) {
                let participants = [new WechatParticipant(wechatyContact)]
                let contact = new WechatChannel(wechatyContact, this.config.threadReclaimTimeout, participants)

                this.contacts.set(contact.id(), contact)
                console.log(`[${new Date}] 'friend '${userName}' with id'${contact.id()}' added`)
            } else {
                console.warn(`[${new Date}] friend name/alias '${userName}' not found`)
            }
        }
    }

    handleLogout(): void {
        console.log(`[${new Date}] 'logout' event triggered`)
    }

    async handleMessage(msg: ChatyMessage): Promise<void> {

        if (msg.room()) {
            console.log(`[${new Date}] channel message received`)

            let room = msg.room()!;

            if (!this.rooms.has(room.id)) {
                console.log(`[${new Date}] message(room:${room.id}) not comes from whitelist, ignore it`)
                return
            }

            if (msg.type() !== this.wechaty.Message.Type.Text) {
                console.log(`[${new Date}] message is not text, ignore it`)
                return
            }

            if (!await msg.mentionSelf() && !msg.text().startsWith("cosmos")) {
                console.log(`[${new Date}] message not mention me, ignore it`)
                return
            }

            let mentions = (await msg.mentionList()).filter((v: Contact) => {
                if (v.self()) {
                    return false
                }
                return true
            }).map((v: Contact) => {
                return new WechatParticipant(v)
            })

            // add talker when use @ to wakeup cosmos
            if (await msg.mentionSelf()) {
                mentions.push(new WechatParticipant(msg.talker()))
            }

            let message = new WechatMessage(this.rooms.get(room.id)!.findOrAddThread(mentions), new WechatParticipant(msg.talker()), mentions, msg.text())

            for (let cb of this.callbacks.get(BotEventType.MessageEvent)!) {
                cb(message)
            }
        } else if (msg.listener()) {
            console.log(`[${new Date}] dm message received`)

            let listener = msg.listener()!;
            let talker = msg.talker()!;

            if (!this.contacts.get(talker.id)) {
                console.log(`[${new Date}] message(talker:${talker.id}) not comes from whitelist, ignore it`)
                return
            }

            if (!listener.self()) {
                console.log(`[${new Date}] message not for me, ignore it`)
                return
            }

            if (msg.type() !== this.wechaty.Message.Type.Text) {
                console.log(`[${new Date}] message is not text, ignore it`)
                return
            }

            let message = new WechatMessage(this.contacts.get(talker.id)!.findOrAddThread([]), new WechatParticipant(msg.talker()), [], msg.text())

            for (let cb of this.callbacks.get(BotEventType.MessageEvent)!) {
                cb(message)
            }
        }
    }
}
