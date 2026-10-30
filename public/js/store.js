// 存储兜底：部分内置浏览器禁用 localStorage，不能让整页脚本挂掉
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } },
};
