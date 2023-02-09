# Cosmos

First, create a config file at where you start:

```json
{
    "chatgpt_key": "",
    "channel_whitelist": ["group name"],
    "dm_whitelist": ["your user name(not wechat id or alias)"]
}
```

Only messages from whitelist will be responded.

Then type following commands to start:

```shell
npm start
```

Finally, check `/tmp/.wechat_qrcode` for your login QR code. Temporary login
file will be store in current directory with name `cosmos.memory-card.json`.
