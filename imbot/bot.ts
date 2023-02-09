export interface Sender {
    send(content: string): Promise<void>;
}

export interface Participant {
    id(): string;
    isMyself(): boolean;
}

export interface Thread extends Sender {
    id(): string;
    channel(): Channel;
}

export interface Channel extends Sender {
    id(): string;
    participants(): Participant[];
    findThread(id: string): Thread | undefined;
}

export interface Message {
    thread(): Thread;
    from(): Participant;
    cc(): Participant[];
    content(): string;
}

export enum BotEventType {
    MessageEvent,
}

export type EventCallback = (message: Message) => void;

export interface Bot {
    run(): Promise<void>;
    stop(): void;
    findChannel(name: string): Promise<Channel | undefined>;
    findDm(name: string): Promise<Channel | undefined>;
    on(ev: BotEventType, cb: EventCallback): void;
}
