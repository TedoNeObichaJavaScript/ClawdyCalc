// Who's logged in to Claude Code, and their plan. Only the bits the page shows.
const { planFromAccount } = require('./pricing');
const { readJson } = require('./util');
const { CLAUDE_JSON } = require('./paths');

async function readAccount() {
  const j = await readJson(CLAUDE_JSON);
  const o = j && j.oauthAccount;
  const firstUse = j && j.firstStartTime ? Date.parse(j.firstStartTime) : null;
  if (!o) return { loggedIn: false, firstUse };
  return {
    loggedIn: true,
    name: o.displayName || (o.fullName ? o.fullName.split(' ')[0] : null),
    plan: planFromAccount(o),
    subscribedSince: o.subscriptionCreatedAt || null,
    firstUse,
  };
}

module.exports = { readAccount };
