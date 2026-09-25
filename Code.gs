// ============================================================
// JOEL CALENDAR BOT — PUSH VERSION
// ============================================================

const CONFIG = {
  CALENDAR_ID:
    PropertiesService.getScriptProperties().getProperty("CALENDAR_ID"),

  TELEGRAM_BOT_TOKEN:
    PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN"),

  TELEGRAM_CHAT_ID:
    PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID"),

  MY_NAME: "Joel",
};

// ============================================================
// PEOPLE ALREADY ASSIGNED
// ============================================================

const PEOPLE_NAMES = [
  "Joel",
  "Quentin",
  "Kosto",
  "Basti",
  "Marko",
  "Adam",
  "Dusan",
  "Dušan",
  "Michal",
];

// ============================================================
// WEB APP
// Google Calendar sends POST requests here.
// ============================================================

function doPost(e) {
  try {
    processCalendarChanges();
  } catch (error) {
    console.error(error);
  }

  return ContentService.createTextOutput("OK");
}

// ============================================================
// GET
// ============================================================

function doGet() {
  return ContentService.createTextOutput("Joel Calendar Bot is running.");
}

// ============================================================
// INITIALIZE
//
// RUN ONCE before activating the watch.
//
// Existing events will NOT be changed.
// ============================================================

function initializePush() {
  const properties = PropertiesService.getScriptProperties();

  properties.setProperty("lastCheckTime", new Date().toISOString());

  Logger.log("Push monitoring initialized.");
}

// ============================================================
// PROCESS CHANGES
// ============================================================

function processCalendarChanges() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    return;
  }

  try {
    const properties = PropertiesService.getScriptProperties();

    let lastCheck = properties.getProperty("lastCheckTime");

    if (!lastCheck) {
      lastCheck = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    }

    const currentTime = new Date();

    let pageToken = null;

    do {
      const response = Calendar.Events.list(
        CONFIG.CALENDAR_ID,

        {
          updatedMin: lastCheck,

          showDeleted: false,

          singleEvents: false,

          maxResults: 2500,

          pageToken: pageToken,
        },
      );

      const events = response.items || [];

      for (let i = 0; i < events.length; i++) {
        processEvent(events[i]);
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    properties.setProperty("lastCheckTime", currentTime.toISOString());
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// PROCESS EVENT
// ============================================================

function processEvent(event) {
  if (event.status === "cancelled") {
    return;
  }

  const title = event.summary || "";

  if (!title.trim()) {
    return;
  }

  // ==========================================================
  // SOMEONE ALREADY HAS THIS EVENT
  // ==========================================================

  if (hasPersonName(title)) {
    return;
  }

  // ==========================================================
  // PLAYER COUNT
  // ==========================================================

  const playerCount = getPlayerCount(title);

  // ==========================================================
  // SK EVENT
  //
  // Normally Joel is NOT assigned to SK events.
  //
  // EXCEPTION:
  // If the event has more than 15 players,
  // Joel is assigned even if it is SK.
  // ==========================================================

  if (hasSK(title) && playerCount <= 15) {
    return;
  }

  // ==========================================================
  // ASSIGN JOEL
  // ==========================================================

  const newTitle = title.trim() + " " + CONFIG.MY_NAME;

  Calendar.Events.patch(
    {
      summary: newTitle,
    },

    CONFIG.CALENDAR_ID,

    event.id,
  );

  // ==========================================================
  // TELEGRAM
  // ==========================================================

  sendTelegram(
    "🆕 <b>NEW EVENT</b>\n\n" +
      "📌 " +
      escapeHtml(newTitle) +
      "\n" +
      "📅 " +
      formatDate(event.start) +
      "\n" +
      "🕒 " +
      formatTime(event.start) +
      " – " +
      formatTime(event.end),

    event.htmlLink,
  );
}

// ============================================================
// PLAYER COUNT
//
// Supports examples such as:
//
// PB20
// PB 20
// PB20 SK
// LG20
// LG 20 SK
// PB50SK
// LG8-10 SK
//
// For ranges such as LG8-10,
// the first number is used.
// ============================================================

function getPlayerCount(title) {
  const normalized = title.toUpperCase();

  const match = normalized.match(/\b(?:PB|LG)\s*(\d+)/);

  if (!match) {
    return 0;
  }

  return parseInt(match[1], 10);
}

// ============================================================
// SK CHECK
// ============================================================

function hasSK(title) {
  return /sk/i.test(title);
}

// ============================================================
// PERSON CHECK
// ============================================================

function hasPersonName(title) {
  const normalizedTitle = normalizeText(title);

  for (let i = 0; i < PEOPLE_NAMES.length; i++) {
    const name = normalizeText(PEOPLE_NAMES[i]);

    const regex = new RegExp(
      "(^|[^a-z])" + escapeRegex(name) + "(?=$|[^a-z])",

      "i",
    );

    if (regex.test(normalizedTitle)) {
      return true;
    }
  }

  return false;
}

// ============================================================
// NORMALIZE TEXT
// ============================================================

function normalizeText(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ============================================================
// ESCAPE REGEX
// ============================================================

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// TELEGRAM
// ============================================================

function sendTelegram(message, eventLink) {
  const url =
    "https://api.telegram.org/bot" + CONFIG.TELEGRAM_BOT_TOKEN + "/sendMessage";

  const payload = {
    chat_id: CONFIG.TELEGRAM_CHAT_ID,

    text: message,

    parse_mode: "HTML",
  };

  if (eventLink) {
    payload.reply_markup = JSON.stringify({
      inline_keyboard: [
        [
          {
            text: "🔗 Open event in Google Calendar",

            url: eventLink,
          },
        ],
      ],
    });
  }

  UrlFetchApp.fetch(
    url,

    {
      method: "post",

      contentType: "application/json",

      payload: JSON.stringify(payload),

      muteHttpExceptions: true,
    },
  );
}

// ============================================================
// CREATE PUSH WATCH
//
// RUN THIS AFTER DEPLOYING THE WEB APP.
// ============================================================

function createPushWatch() {
  const webAppUrl =
    PropertiesService.getScriptProperties().getProperty("WEB_APP_URL");

  if (!webAppUrl) {
    throw new Error("WEB_APP_URL is not configured in Script Properties.");
  }

  const channelId = Utilities.getUuid();

  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;

  const resource = {
    id: channelId,

    type: "web_hook",

    address: webAppUrl,

    token: "joel-calendar",

    expiration: expiration,
  };

  const result = Calendar.Events.watch(
    resource,

    CONFIG.CALENDAR_ID,
  );

  const properties = PropertiesService.getScriptProperties();

  properties.setProperty("channelId", result.id);

  properties.setProperty("resourceId", result.resourceId);

  properties.setProperty("channelExpiration", String(result.expiration));

  Logger.log("Push watch created.");

  Logger.log("Channel ID: " + result.id);
}

// ============================================================
// RENEW PUSH WATCH
// ============================================================

function renewPushWatch() {
  try {
    createPushWatch();
  } catch (error) {
    console.error(error);
  }
}

// ============================================================
// CREATE RENEWAL TRIGGER
//
// This trigger is ONLY for renewing the Google
// push subscription.
// ============================================================

function createRenewalTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "renewPushWatch") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("renewPushWatch")

    .timeBased()

    .everyDays(1)

    .create();

  Logger.log("Automatic push renewal enabled.");
}

// ============================================================
// TELEGRAM TEST
// ============================================================

function testTelegramPush() {
  sendTelegram(
    "✅ <b>Joel Calendar Bot</b>\n\n" + "Push version is connected.",
  );
}

// ============================================================
// DATE
// ============================================================

function formatDate(start) {
  const date = getEventDate(start);

  return Utilities.formatDate(
    date,

    Session.getScriptTimeZone(),

    "dd.MM.yyyy",
  );
}

// ============================================================
// TIME
// ============================================================

function formatTime(start) {
  if (start.date) {
    return "All day";
  }

  const date = getEventDate(start);

  return Utilities.formatDate(
    date,

    Session.getScriptTimeZone(),

    "HH:mm",
  );
}

// ============================================================
// EVENT DATE
// ============================================================

function getEventDate(start) {
  if (start.dateTime) {
    return new Date(start.dateTime);
  }

  if (start.date) {
    return new Date(start.date + "T00:00:00");
  }

  return new Date();
}

// ============================================================
// TELEGRAM HTML ESCAPE
// ============================================================

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================
// WEBHOOK TEST
// ============================================================

function testWebhook() {
  const url =
    PropertiesService.getScriptProperties().getProperty("WEB_APP_URL");

  if (!url) {
    throw new Error("WEB_APP_URL is not configured in Script Properties.");
  }

  const response = UrlFetchApp.fetch(
    url,

    {
      method: "post",

      contentType: "application/json",

      payload: JSON.stringify({
        test: true,
      }),

      muteHttpExceptions: true,
    },
  );

  Logger.log("Webhook URL: " + url);

  Logger.log("Response code: " + response.getResponseCode());

  Logger.log("Response: " + response.getContentText());
}
