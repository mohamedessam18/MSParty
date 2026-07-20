import { io, Socket } from "socket.io-client";
type Settings = { apiUrl: string; syncUrl: string; token: string; partyId: string };
let socket: Socket | undefined;
async function settings(): Promise<Settings> { return chrome.storage.local.get(["apiUrl", "syncUrl", "token", "partyId"]) as Promise<Settings>; }
function broadcast(message: unknown) { chrome.tabs.query({ url: ["https://www.netflix.com/*", "https://shahid.mbc.net/*"] }, tabs => tabs.forEach(tab => tab.id && chrome.tabs.sendMessage(tab.id, message))); }
async function connect() { const value = await settings(); socket?.disconnect(); if (!value.token || !value.partyId || !value.syncUrl) return; socket = io(value.syncUrl, { auth: { userToken: value.token } }); socket.on("connect", () => socket?.emit("join-party", { partyId: value.partyId, userToken: value.token })); socket.on("sync:state", state => broadcast({ type: "apply-state", state })); socket.on("sync:heartbeat", state => broadcast({ type: "apply-state", state })); }
chrome.runtime.onMessage.addListener((message) => { if (message.type === "connect") connect(); if (message.type === "control") settings().then(value => socket?.emit(`control:${message.control}`, { partyId: value.partyId, timestamp: message.timestamp })); });
chrome.runtime.onStartup.addListener(connect); chrome.runtime.onInstalled.addListener(connect);
