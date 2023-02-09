import { ChatGPTAPI } from 'chatgpt';
import { ConfigBuilder } from './config';
import { BotEventType, Message } from './IMBot/bot'
import { WechatBot } from './IMBot/wechat'

interface ChatGptTracker {
    conversationId: string | undefined,
    parentMessageId: string,
}

async function main() {
    let config = (new ConfigBuilder()).build()
    let chatgpt = new ChatGPTAPI({
        apiKey: config.chatGPTKey
    })
    let bot = new WechatBot({
        botName: "cosmos",
        threadReclaimTimeout: 30 * 60 * 1000,
        groupWhitelist: config.channelWhiteList,
        userWhitelist: config.dmWhiteList,
        loginQRCodePath: "/tmp/.wechat_qrcode"
    })
    let trackers: Map<string, ChatGptTracker> = new Map<string, ChatGptTracker>;

    bot.on(BotEventType.MessageEvent, async (m: Message) => {
        let thread = m.thread()
        let res = await chatgpt.sendMessage(m.content())

        trackers.set(thread.id(), {
            conversationId: res.conversationId,
            parentMessageId: res.id,
        })
    })

    bot.run()
}

main().catch((e) => {
    console.error(e)
})
