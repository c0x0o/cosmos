import { env } from 'process';
import { readFileSync } from 'fs';

class BuildConfigError extends Error { };

const DEFAULT_CONFIG = "./cosmos.json"

export interface Config {
    chatGPTKey: string,
    channelWhiteList: string[],
    dmWhiteList: string[],
}

export class ConfigBuilder {
    private configJson: any;

    constructor() {
        let configPath = env["COSMOS_CONFIG"] ? env["COSMOS_CONFIG"] : DEFAULT_CONFIG;
        try {
            let jsonString = readFileSync(configPath, "utf-8");
            this.configJson = JSON.parse(jsonString)
        } catch (e) {
            throw new BuildConfigError(`read chatgpt key file failed, due to ${e}`)
        }
    }

    build(): Config {
        return {
            chatGPTKey: this.configJson["chatgpt_key"], 
            channelWhiteList: this.configJson["channel_whitelist"],
            dmWhiteList: this.configJson["dm_whitelist"],
        }
    };
};
