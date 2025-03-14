'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const { AzureOpenAI } = require("openai");

const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME; // model = "deployment name".
const apiVersion = "2024-05-01-preview";
const key = process.env.AZURE_OPENAI_KEY;
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiClient = new AzureOpenAI({
  apiKey: key,
  deployment: deployment,
  endpoint: endpoint,
  apiVersion: apiVersion,
});

// 会話履歴の保存（本当はDBを使った方が良い、ハンズオンなので簡単な方法で実施した）
let chatHistory = {};  

// データを追加する関数  
function saveChatHistory(id, currentHistory) {  

  if (!chatHistory[id]) {  
    chatHistory[id] = [];  
  }  

  // 履歴は最大10件までにしておく
  if (chatHistory[id].length >= 10) {  
    chatHistory[id].splice(0, 2); // 最古のメッセージを削除  
  }  

  chatHistory[id] = currentHistory;
}  

// データを取得する関数  
function getChatHistory(id) {  
  if (chatHistory[id]) {  
      console.log(`Customer retrieved: ${id}`);  
      return chatHistory[id];  
  } else {  
      console.log(`Chat History not found for id: ${id}`);  
      return []; 
  }  
}  

// create LINE SDK config from env variables
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// event handler
async function handleEvent(event) {
  console.log('processing handleEvent');  
  const userId = event.source.userId;

  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  // https://learn.microsoft.com/en-us/javascript/api/overview/azure/openai-readme?view=azure-node-preview
  // Replace with your Azure OpenAI key
  const key = process.env.AZURE_OPENAI_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  // const openaiClient = new OpenAIClient(endpoint, new AzureKeyCredential(key));

  const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_NAME; // model = "deployment name".

  // モデルに渡すメッセージ情報の作成
  let messages = [
    { role: "system", content: "あなたは岡山弁を喋るAIアシスタントです。" },
  ];

  let lastHistory = getChatHistory(userId);

  messages = messages.concat(lastHistory)

  // ユーザーのメッセージをセット
  messages.push({ role: "user", content: event.message.text });

  console.log(`Messages: ${messages.map((m) => m.content).join("\n")}`);

  // const result = await openaiClient.chat.completions.create(deploymentId, messages, { maxTokens: 4096 });

  const events = await openaiClient.chat.completions.create({
    messages: messages,
    model: "",
    max_tokens: 128,
    stream: true,
  });

  let msg = '';
  for await (const event of events) {
    for (const choice of event.choices) {
      const delta = choice.delta?.content;
      if (delta !== undefined) {
        msg　 += `${delta}`;
        // console.log(`Chatbot: ${delta}`);
      }
    }
  }

  // 会話履歴の保存
  lastHistory.push({ role: "user", content: event.message.text });
  lastHistory.push({ role: "assistant", content: msg });
  saveChatHistory(userId, lastHistory);

  // // DEBUG用:for文でメッセージを順番に処理  
  // for (let i = 0; i < lastHistory.length; i++) {  
  //   console.log(`Message ${i + 1}:　Content - ${lastHistory[i].content}`);  
  // }  

  // create an echoing text message
  console.log(msg);
  const echo = { type: 'text', text: msg };

  // use reply API
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [echo],
  });
}

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});