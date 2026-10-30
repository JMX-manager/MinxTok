// 全局共享状态：单独成模块，避免 app.js 与子页互相 import 成环
import { store } from './store.js';

export const state = {
  quote: null,
  uid: store.get('minxtok.uid'),
  conversationId: store.get('minxtok.conv') || null,
  sending: false,
  paused: false,
  quota: null,      // { used, limit } 唯一额度快照
  lastLimit: null,
  authed: false,
};

if (!state.uid) {
  state.uid = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  store.set('minxtok.uid', state.uid);
}
