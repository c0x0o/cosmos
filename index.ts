import { ChatGPTAPI } from 'chatgpt';
import { ConfigBuilder } from './config.js';
import { BotEventType, Message } from './imbot/bot.js'
import { WechatBot } from './imbot/wechat.js'

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
        let res = await chatgpt.sendMessage(m.content(), {
            promptPrefix: `You are cosmos, based on ChatGPT.
You use Chinese as your first language.
Current date: ${new Date().toISOString()}\n\n`
        })

        trackers.set(thread.id(), {
            conversationId: res.conversationId,
            parentMessageId: res.id,
        })

        thread.send(res.text)
    })

    bot.run()
}

main().catch((e) => {
    console.error(e)
})
