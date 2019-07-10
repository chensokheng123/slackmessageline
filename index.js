"use strict";

require("dotenv").config();
//slack web api
const {
    WebClient
} = require("@slack/web-api");

const Webclient = new WebClient(process.env.TOKEN);

//Database
const DB = require('nedb-async').default;
var db = new DB({
    filename: './dataBase/lastMessage.db',
    autoload: true
});
//line
const line = require("@line/bot-sdk");
const client = new line.Client({
    channelAccessToken: process.env.LINE_TOKEN
});

//cron
var CronJob = require('cron').CronJob;


let channels, last_msg = [],
    res = [],
    channelsName = [],
    docs;
async function getAllChannel() {
    try {
        const slackChannels = await Webclient.channels.list({});
        channels = slackChannels.channels.map(channel => Object({
            "id": channel.id,
            "name": channel.name,
        }));

        channelsName = slackChannels.channels.map(channel => channel.name);
    } catch (e) {
        console.log(e);
        console.log("Error Occur");
    }
}


async function slackLastesMsg() {
    try {
        await getAllChannel();
        for (const channel of channels) {
            let data = await Webclient.conversations.history({
                channel: channel.id,
                limit: 1,

            });
            last_msg.push(Object({
                "channel_id": channel.id,
                "channel_name": channel.name,
                "channel_last_ts": data.messages[0].ts,
                "is_there_msg": true
            }))
        }
    } catch (e) {
        console.log(e);
        console.log("Error Occur");
    }
}


const saveToDb = async () => {
    try {
        // check if there is new message
        for (const ele of last_msg) {
            let doc = await db.asyncFindOne({
                "channel_id": ele.channel_id
            });
            if (!doc) {
                db.insert(ele);

            } else {
                if (doc.channel_last_ts === ele.channel_last_ts && doc.is_there_msg) {
                    ele.is_there_msg = false;
                    db.update(doc, ele);

                } else if (doc.channel_last_ts !== ele.channel_last_ts) {
                    ele.is_there_msg = true
                    db.update(doc, ele);
                }
            }
        }
        // if the channel has been delete
        docs = await db.asyncFind({});
        if (docs.length > res.length) {
            for (const doc of docs) {
                if (!channelsName.includes(doc.channel_name)) {
                    db.remove(doc);
                    console.log("delete channel " + doc.channel_name);
                }
            }
        }
        // display to the console 
        for (const doc of docs) {
            console.log(doc.channel_id, doc.channel_name, doc.channel_last_ts, doc.is_there_msg);
        }
    } catch (e) {
        console.log("Error occur");
    }
}


async function get_message_each_fiveMinute() {
    try {
        let docs = await db.asyncFind({});
        for (const doc of docs) {
            let data = await Webclient.conversations.history({
                channel: doc.channel_id,
                limit: 100,
                oldest: doc.channel_last_ts
            });
            await client.pushMessage(process.env.GROUP_ID, {
                type: 'text',
                text: `#:${doc.channel_name} [new message: ${data.messages.length}]\nhttps://code4kit.slack.com/archives/${doc.channel_id}\n`
            });
        }
        db.remove({}, {
            multi: true
        });
    } catch (e) {
        console.log(e);
        console.log("Error Occur");
    }

}

async function getLastMessage() {
    try {
        let data = await db.asyncFind({});
        if (data.length === 0) {
            await slackLastesMsg();
            await saveToDb();
        }
    } catch (e) {
        console.log(e);
        console.log("Error Occur");
    }
}


getLastMessage();
const sendMessage = new CronJob('0-23/6 * * * *', async function () {
    try {
        await get_message_each_fiveMinute();
        await getLastMessage();
    } catch (e) {
        console.log(e);
        console.log("Error Occur");
    }
});
sendMessage.start();