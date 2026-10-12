(() => {
  const $ = selector => document.querySelector(selector);
  const dialog = $("#dm-dialog"), contact = $("#dm-contact"), adminList = $("#dm-messages"), adminForm = $("#dm-form"), adminInput = $("#dm-input"), adminError = $("#dm-error"), adminView = $("#dm-admin-view");
  const sidebar = $("#dm-sidebar"), backdrop = $("#dm-sidebar-backdrop"), conversations = $("#dm-conversations"), sidebarError = $("#dm-sidebar-error"), sidebarTitle = $("#dm-sidebar h2"), toggle = $("#dm-open");
  const groupPanel = $("#chat-panel"), threadPanel = $("#dm-thread-view"), threadTitle = $("#dm-thread-title"), threadAvatar = $("#dm-thread-avatar"), threadMessages = $("#dm-thread-messages"), threadForm = $("#dm-thread-form"), threadInput = $("#dm-thread-input"), threadError = $("#dm-thread-error");
  let peerId = "", messages = [], adminMessages = [], inbox = [], contacts = [], showingContacts = false, adminMode = false;
  const adminOpen = $("#dm-admin-open");
  adminView.hidden = !account?.admin; adminOpen.hidden = !account?.admin;
  const label = profile => profile?.nickname || profile?.name || "Unknown";
  const profiles = new Map();
  function relativeTime(timestamp) {
    const age = Math.max(0, Date.now() - Number(timestamp || 0));
    if (age < 60000) return "now";
    if (age < 3600000) return `${Math.floor(age / 60000)}m`;
    if (age < 86400000) return `${Math.floor(age / 3600000)}h`;
    if (age < 604800000) return `${Math.floor(age / 86400000)}d`;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
  }
  function refreshInbox() {
    socket.emit("get dm inbox", result => {
      if (!result?.ok) { sidebarError.textContent = result?.error || "Could not load direct messages."; return; }
      inbox = result.conversations || []; inbox.forEach(item => profiles.set(item.peer.id, item.peer));
      if (!showingContacts) renderInbox();
    });
  }
  function makePersonButton(profile, conversation) {
    const item = document.createElement("li"), button = document.createElement("button"), avatar = document.createElement("span"), copy = document.createElement("span"), name = document.createElement("strong");
    button.type = "button"; button.className = "dm-conversation"; button.setAttribute("aria-label", `${label(profile)}${conversation?.unread ? `, ${conversation.unread} unread` : ""}`);
    avatar.className = "dm-conversation-avatar"; avatar.textContent = label(profile).trim().charAt(0).toUpperCase() || "?";
    if (profile.avatar) { const image = document.createElement("img"); image.src = profile.avatar; image.alt = ""; avatar.replaceChildren(image); }
    copy.className = "dm-conversation-copy"; name.className = "dm-conversation-name"; name.textContent = label(profile); copy.append(name);
    if (conversation) { const preview = document.createElement("span"), time = document.createElement("time"); preview.className = "dm-conversation-preview"; preview.textContent = conversation.preview || "Start a conversation"; time.className = "dm-conversation-time"; time.textContent = relativeTime(conversation.timestamp); copy.append(preview); button.append(avatar, copy, time); if (conversation.unread > 0) { const badge = document.createElement("span"); badge.className = "dm-unread-badge"; badge.textContent = conversation.unread > 99 ? "99+" : String(conversation.unread); badge.setAttribute("aria-label", `${conversation.unread} unread messages`); button.append(badge); } }
    else button.append(avatar, copy);
    item.append(button); return { item, button };
  }
  function renderInbox() {
    sidebarTitle.textContent = "Messages"; conversations.replaceChildren();
    inbox.forEach(conversation => { const row = makePersonButton(conversation.peer, conversation); row.button.addEventListener("click", () => openThread(conversation.peer.id)); conversations.append(row.item); });
  }
  function showContacts() {
    showingContacts = true; sidebarTitle.textContent = "New message"; sidebarError.textContent = ""; conversations.replaceChildren();
    const cancelItem = document.createElement("li"), cancel = document.createElement("button"); cancel.className = "dm-contact-cancel"; cancel.textContent = "← Back to messages"; cancel.type = "button"; cancel.onclick = () => { showingContacts = false; renderInbox(); }; cancelItem.append(cancel); conversations.append(cancelItem);
    contacts.forEach(profile => { const row = makePersonButton(profile, null); row.button.addEventListener("click", () => openThread(profile.id)); conversations.append(row.item); });
  }
  function openSidebar() { sidebar.classList.add("is-open"); sidebar.setAttribute("aria-hidden", "false"); backdrop.hidden = false; toggle?.setAttribute("aria-expanded", "true"); refreshInbox(); }
  function closeSidebar() { sidebar.classList.remove("is-open"); sidebar.setAttribute("aria-hidden", "true"); backdrop.hidden = true; toggle?.setAttribute("aria-expanded", "false"); }
  function loadContacts(callback) {
    socket.emit("get dm contacts", result => {
      if (!result?.ok) { sidebarError.textContent = result?.error || "Could not load people."; return; }
      contacts = result.contacts || []; contacts.forEach(profile => profiles.set(profile.id, profile)); callback?.();
    });
  }
  function openThread(id) {
    const peer = profiles.get(id) || contacts.find(profile => profile.id === id) || inbox.find(item => item.peer.id === id)?.peer;
    if (!peer) return;
    showingContacts = false; renderInbox(); peerId = id; messages = []; threadError.textContent = ""; threadTitle.textContent = label(peer); threadAvatar.src = peer.avatar || ""; threadAvatar.hidden = !peer.avatar;
    groupPanel.hidden = true; threadPanel.hidden = false; closeSidebar(); drawThread();
    socket.emit("get direct messages", id, result => {
      if (!result?.ok) { threadError.textContent = result?.error || "Could not load this conversation."; return; }
      if (peerId === id) { profiles.set(result.peer.id, result.peer); messages = result.messages || []; drawThread(); socket.emit("mark dm read", id, refreshInbox); }
    });
  }
  function backToGroup() { peerId = ""; threadPanel.hidden = true; groupPanel.hidden = false; }
  function addThreadMessage(message) {
    const item = document.createElement("li"), meta = document.createElement("div"), line = document.createElement("div"), author = document.createElement("strong"), time = document.createElement("time"), body = document.createElement("div"), content = document.createElement("div"), text = document.createElement("p");
    item.className = `chat-message${message.fromId === accountId ? " dm-mine" : ""}`; meta.className = "message-meta"; line.className = "author-line"; author.textContent = message.fromId === accountId ? "You" : label(profiles.get(message.fromId)); time.textContent = new Intl.DateTimeFormat(undefined, {hour:"numeric", minute:"2-digit"}).format(message.timestamp); line.append(author, time); meta.append(line); body.className = "message-body"; content.className = "message-content"; text.textContent = message.text; content.append(text); body.append(content); item.append(meta, body); threadMessages.append(item);
  }
  function drawThread() { threadMessages.replaceChildren(); messages.forEach(addThreadMessage); threadMessages.scrollTop = threadMessages.scrollHeight; }
  function receive(message) {
    if (!message) return; refreshInbox();
    if (!((message.fromId === accountId && message.toId === peerId) || (message.fromId === peerId && message.toId === accountId))) return;
    if (!profiles.has(message.fromId) && inbox.find(item => item.peer.id === message.fromId)) profiles.set(message.fromId, inbox.find(item => item.peer.id === message.fromId).peer);
    const index = messages.findIndex(item => item.id === message.id); if (index < 0) messages.push(message); else messages[index] = message;
    messages.sort((a,b) => a.timestamp-b.timestamp); drawThread();
    if (!threadPanel.hidden && message.fromId !== accountId) socket.emit("mark dm read", peerId, refreshInbox);
  }
  toggle?.addEventListener("click", openSidebar); $("#dm-thread-sidebar-open").addEventListener("click", openSidebar); backdrop.addEventListener("click", closeSidebar);
  $("#dm-new").addEventListener("click", () => loadContacts(showContacts));
  $("#dm-thread-back").addEventListener("click", backToGroup);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeSidebar(); });
  threadForm.addEventListener("submit", event => {
    event.preventDefault(); const text = threadInput.value.trim(); if (!peerId || !text) return;
    const toId = peerId; threadInput.disabled = true; socket.emit("direct message", {toId, text}, result => {
      threadInput.disabled = false; if (!result?.ok) { threadError.textContent = result?.error || "Message could not be sent."; return; }
      threadInput.value = ""; threadInput.focus(); threadError.textContent = "";
    });
  });
  socket.on("direct message", receive); socket.on("connect", refreshInbox); socket.on("history", () => { adminOpen.hidden = !account?.admin; adminView.hidden = !account?.admin; refreshInbox(); });

  // Preserve the existing admin-only DM inspection tools in their separate dialog.
  function drawAdmin() {
    adminList.replaceChildren();
    adminMessages.forEach(message => { const item = document.createElement("li"), author = document.createElement("strong"), text = document.createElement("span"), time = document.createElement("time"); item.className = "dm-message"; author.textContent = label(profiles.get(message.fromId)); text.textContent = message.text; time.textContent = new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(message.timestamp); item.append(author,text,time); adminList.append(item); });
    adminList.scrollTop = adminList.scrollHeight;
  }
  function loadAdminList() {
    adminError.textContent = ""; contact.disabled = true;
    socket.emit("admin get dm conversations", result => { contact.disabled = false; if (!result?.ok) { adminError.textContent = result?.error || "Could not load conversations."; return; } contact.replaceChildren(new Option("Choose a conversation…", "")); result.conversations.forEach(pair => { profiles.set(pair.a.id,pair.a); profiles.set(pair.b.id,pair.b); const option = new Option(`${label(pair.a)} ↔ ${label(pair.b)}`, pair.key); option.pair = pair; contact.add(option); }); adminMessages=[]; adminList.replaceChildren(); });
  }
  contact.addEventListener("change", () => { const pair=contact.selectedOptions[0]?.pair; if (!pair) return; socket.emit("admin get dm conversation",{a:pair.a.id,b:pair.b.id},result=>{ if (!result?.ok) { adminError.textContent=result?.error||"Could not load this conversation."; return; } profiles.set(result.a.id,result.a); profiles.set(result.b.id,result.b); adminMessages=result.messages||[]; drawAdmin(); }); });
  function openAdminDMs() { adminMode=true; adminForm.hidden=true; dialog.showModal(); loadAdminList(); }
  adminView.addEventListener("click", openAdminDMs); adminOpen.addEventListener("click", openAdminDMs);
  $("#dm-close").addEventListener("click", () => dialog.close());
  adminForm.addEventListener("submit", event => { event.preventDefault(); const text=adminInput.value.trim(); if (!peerId||!text||adminMode) return; });
  void adminForm; void adminInput; void adminMode;
})();