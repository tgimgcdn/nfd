function getConfig(env) {
  return {
    TOKEN: env.ENV_BOT_TOKEN, // Get it from @BotFather
    WEBHOOK: '/endpoint',
    SECRET: env.ENV_BOT_SECRET, // A-Z, a-z, 0-9, _ and -
    ADMIN_UID: env.ENV_ADMIN_UID // your user id, get it from https://t.me/username_to_id_bot
  };
}

const NOTIFY_INTERVAL = 3600 * 1000;
const fraudDb = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/fraud.db';
const notificationUrl = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/notification.txt'
const startMsgUrl = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/startMessage.md';

const enable_notification = true

// 数据库表初始化SQL
const DB_INIT = `
CREATE TABLE IF NOT EXISTS message_mappings (
  message_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_blocks (
  chat_id INTEGER PRIMARY KEY,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS last_messages (
  chat_id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL
);
`;

/**
 * Return url to telegram api, optionally with parameters added
 */
function apiUrl (TOKEN, methodName, params = null) {
  let query = ''
  if (params) {
    query = '?' + new URLSearchParams(params).toString()
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`
}

function requestTelegram(TOKEN, methodName, body, params = null){
  return fetch(apiUrl(TOKEN, methodName, params), body)
    .then(r => r.json())
}

function makeReqBody(body){
  return {
    method:'POST',
    headers:{
      'content-type':'application/json'
    },
    body:JSON.stringify(body)
  }
}

function sendMessage(TOKEN, msg = {}){
  return requestTelegram(TOKEN, 'sendMessage', makeReqBody(msg))
}

function copyMessage(TOKEN, msg = {}){
  return requestTelegram(TOKEN, 'copyMessage', makeReqBody(msg))
}

function forwardMessage(TOKEN, msg){
  return requestTelegram(TOKEN, 'forwardMessage', makeReqBody(msg))
}

/**
 * 初始化数据库表结构
 */
async function initDatabase(env) {
  try {
    console.log("开始检查数据库...");
    
    const checkTables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    
    console.log("现有表:", checkTables.results);
    
    return true;
  } catch (error) {
    console.error("数据库检查失败:", error);
    throw error;
  }
}

/**
 * 处理数据库初始化请求
 */
async function handleInitDB(event) {
  try {
    await initDatabase(event.env);
    return new Response('数据库初始化完成，表已创建');
  } catch (error) {
    return new Response('数据库初始化失败: ' + error.message, { status: 500 });
  }
}

/**
 * Handle requests to WEBHOOK
 * https://core.telegram.org/bots/api#update
 */
async function handleWebhook (event) {
  const config = getConfig(event.env);
  
  // Check secret
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== config.SECRET) {
    return new Response('Unauthorized', { status: 403 })
  }

  // 确保数据库初始化
  await initDatabase(event.env);

  // Read request body synchronously
  const update = await event.request.json()
  // Deal with response asynchronously
  onUpdate(update, event.env)

  return new Response('Ok')
}

/**
 * Handle incoming Update
 * https://core.telegram.org/bots/api#update
 */
async function onUpdate (update, env) {
  if ('message' in update) {
    await onMessage(update.message, env)
  }
}

/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
async function onMessage (message, env) {
  const config = getConfig(env);
  
  if(message.text === '/start'){
    let startMsg = await fetch(startMsgUrl).then(r => r.text())
    return sendMessage(config.TOKEN, {
      chat_id:message.chat.id,
      text:startMsg,
    })
  }
  
  if(message.chat.id.toString() === config.ADMIN_UID){
    if(!message?.reply_to_message?.chat){
      return sendMessage(config.TOKEN, {
        chat_id:config.ADMIN_UID,
        text:'使用方法，回复转发的消息，并发送回复消息，或者`/block`、`/unblock`、`/checkblock`等指令'
      })
    }
    if(/^\/block$/.exec(message.text)){
      return handleBlock(message, env)
    }
    if(/^\/unblock$/.exec(message.text)){
      return handleUnBlock(message, env)
    }
    if(/^\/checkblock$/.exec(message.text)){
      return checkBlock(message, env)
    }
    
    // 从数据库中获取消息映射
    const { results } = await env.DB.prepare(
      "SELECT chat_id FROM message_mappings WHERE message_id = ?"
    ).bind(message.reply_to_message.message_id).all();
    
    if (results.length === 0) {
      return sendMessage(config.TOKEN, {
        chat_id: config.ADMIN_UID,
        text: '未找到对应的聊天记录'
      });
    }
    
    const guestChantId = results[0].chat_id;
    
    return copyMessage(config.TOKEN, {
      chat_id: guestChantId,
      from_chat_id:message.chat.id,
      message_id:message.message_id,
    })
  }
  return handleGuestMessage(message, env)
}

async function handleGuestMessage(message, env){
  const config = getConfig(env);
  let chatId = message.chat.id;
  
  // 检查用户是否被屏蔽
  const { results } = await env.DB.prepare(
    "SELECT is_blocked FROM user_blocks WHERE chat_id = ?"
  ).bind(chatId).all();
  
  const isblocked = results.length > 0 && results[0].is_blocked;
  
  if(isblocked){
    return sendMessage(config.TOKEN, {
      chat_id: chatId,
      text:'Your are blocked'
    })
  }

  let forwardReq = await forwardMessage(config.TOKEN, {
    chat_id:config.ADMIN_UID,
    from_chat_id:message.chat.id,
    message_id:message.message_id
  })
  console.log(JSON.stringify(forwardReq))
  if(forwardReq.ok){
    // 保存消息ID映射到数据库
    await env.DB.prepare(
      "INSERT OR REPLACE INTO message_mappings (message_id, chat_id) VALUES (?, ?)"
    ).bind(forwardReq.result.message_id, chatId).run();
  }
  return handleNotify(message, env)
}

async function handleNotify(message, env){
  const config = getConfig(env);
  // 先判断是否是诈骗人员，如果是，则直接提醒
  // 如果不是，则根据时间间隔提醒：用户id，交易注意点等
  let chatId = message.chat.id;
  if(await isFraud(chatId)){
    return sendMessage(config.TOKEN, {
      chat_id: config.ADMIN_UID,
      text:`检测到骗子，UID${chatId}`
    })
  }
  if(enable_notification){
    // 从数据库获取上次消息时间
    const { results } = await env.DB.prepare(
      "SELECT timestamp FROM last_messages WHERE chat_id = ?"
    ).bind(chatId).all();
    
    const lastMsgTime = results.length > 0 ? results[0].timestamp : null;
    
    if(!lastMsgTime || Date.now() - lastMsgTime > NOTIFY_INTERVAL){
      // 更新最后消息时间
      await env.DB.prepare(
        "INSERT OR REPLACE INTO last_messages (chat_id, timestamp) VALUES (?, ?)"
      ).bind(chatId, Date.now()).run();
      
      return sendMessage(config.TOKEN, {
        chat_id: config.ADMIN_UID,
        text:await fetch(notificationUrl).then(r => r.text())
      })
    }
  }
}

async function handleBlock(message, env){
  const config = getConfig(env);
  // 获取要屏蔽的用户ID
  const { results } = await env.DB.prepare(
    "SELECT chat_id FROM message_mappings WHERE message_id = ?"
  ).bind(message.reply_to_message.message_id).all();
  
  if (results.length === 0) {
    return sendMessage(config.TOKEN, {
      chat_id: config.ADMIN_UID,
      text: '未找到对应的聊天记录'
    });
  }
  
  const guestChantId = results[0].chat_id;
  
  if(guestChantId.toString() === config.ADMIN_UID){
    return sendMessage(config.TOKEN, {
      chat_id: config.ADMIN_UID,
      text:'不能屏蔽自己'
    })
  }
  
  // 更新用户屏蔽状态
  await env.DB.prepare(
    "INSERT OR REPLACE INTO user_blocks (chat_id, is_blocked) VALUES (?, TRUE)"
  ).bind(guestChantId).run();

  return sendMessage(config.TOKEN, {
    chat_id: config.ADMIN_UID,
    text: `UID:${guestChantId}屏蔽成功`,
  })
}

async function handleUnBlock(message, env){
  const config = getConfig(env);
  // 获取要解除屏蔽的用户ID
  const { results } = await env.DB.prepare(
    "SELECT chat_id FROM message_mappings WHERE message_id = ?"
  ).bind(message.reply_to_message.message_id).all();
  
  if (results.length === 0) {
    return sendMessage(config.TOKEN, {
      chat_id: config.ADMIN_UID,
      text: '未找到对应的聊天记录'
    });
  }
  
  const guestChantId = results[0].chat_id;

  // 更新用户屏蔽状态
  await env.DB.prepare(
    "INSERT OR REPLACE INTO user_blocks (chat_id, is_blocked) VALUES (?, FALSE)"
  ).bind(guestChantId).run();

  return sendMessage(config.TOKEN, {
    chat_id: config.ADMIN_UID,
    text:`UID:${guestChantId}解除屏蔽成功`,
  })
}

async function checkBlock(message, env){
  const config = getConfig(env);
  // 获取要查询的用户ID
  const { results: msgResults } = await env.DB.prepare(
    "SELECT chat_id FROM message_mappings WHERE message_id = ?"
  ).bind(message.reply_to_message.message_id).all();
  
  if (msgResults.length === 0) {
    return sendMessage(config.TOKEN, {
      chat_id: config.ADMIN_UID,
      text: '未找到对应的聊天记录'
    });
  }
  
  const guestChantId = msgResults[0].chat_id;
  
  // 查询用户屏蔽状态
  const { results: blockResults } = await env.DB.prepare(
    "SELECT is_blocked FROM user_blocks WHERE chat_id = ?"
  ).bind(guestChantId).all();
  
  const blocked = blockResults.length > 0 && blockResults[0].is_blocked;

  return sendMessage(config.TOKEN, {
    chat_id: config.ADMIN_UID,
    text: `UID:${guestChantId}` + (blocked ? '被屏蔽' : '没有被屏蔽')
  })
}

/**
 * Send plain text message
 * https://core.telegram.org/bots/api#sendmessage
 */
async function sendPlainText (env, chatId, text) {
  const config = getConfig(env);
  return sendMessage(config.TOKEN, {
    chat_id: chatId,
    text
  })
}

/**
 * Set webhook to this worker's url
 * https://core.telegram.org/bots/api#setwebhook
 */
async function registerWebhook (event, requestUrl, suffix, secret) {
  const config = getConfig(event.env);
  
  // 确保数据库初始化
  await initDatabase(event.env);
  
  // https://core.telegram.org/bots/api#setwebhook
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
  const r = await (await fetch(apiUrl(config.TOKEN, 'setWebhook', { url: webhookUrl, secret_token: secret }))).json()
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
}

/**
 * Remove webhook
 * https://core.telegram.org/bots/api#setwebhook
 */
async function unRegisterWebhook (event) {
  const config = getConfig(event.env);
  const r = await (await fetch(apiUrl(config.TOKEN, 'setWebhook', { url: '' }))).json()
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
}

async function isFraud(id){
  id = id.toString()
  let db = await fetch(fraudDb).then(r => r.text())
  let arr = db.split('\n').filter(v => v)
  console.log(JSON.stringify(arr))
  let flag = arr.filter(v => v === id).length !== 0
  console.log(flag)
  return flag
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const config = getConfig(env);
    
    if (url.pathname === config.WEBHOOK) {
      return handleWebhook({ request, env, ctx });
    } else if (url.pathname === '/registerWebhook') {
      return registerWebhook({ request, env, ctx }, url, config.WEBHOOK, config.SECRET);
    } else if (url.pathname === '/unRegisterWebhook') {
      return unRegisterWebhook({ request, env, ctx });
    } else if (url.pathname === '/initDB') {
      return handleInitDB({ request, env, ctx });
    } else {
      return new Response('No handler for this request');
    }
  }
};
