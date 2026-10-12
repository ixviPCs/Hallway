(() => {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#dm-dialog"), contact = $("#dm-contact"), list = $("#dm-messages"), form = $("#dm-form"), input = $("#dm-input"), error = $("#dm-error"), adminView = $("#dm-admin-view");
  const sidebar = $("#dm-sidebar"), backdrop = $("#dm-sidebar-backdrop"), conversations = $("#dm-conversations"), sidebarError = $("#dm-sidebar-error"), toggle = $("#dm-open");
  let peerId = "", messages = [], adminMode = false, inbox = [];
  adminView.hidden = !account?.admin;
  const label = (profile) => profile.nickname || profile.name;
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
      inbox = result.conversations || []; renderInbox();
    });
  }
  function renderInbox() {
    conversations.replaceChildren();
    for (const conversation of inbox) {
      const item = document.createElement("li"), button = document.createElement("button"), avatar = document.createElement("span"), copy = document.createElement("span"), name = document.createElement("strong"), preview = document.createElement("span"), time = document.createElement("time");
      button.type = "button"; button.className = "dm-conversation"; button.setAttribute("aria-label", `${label(conversation.peer)}${conversation.unread ? `, ${conversation.unread} unread` : ""}`);
      avatar.className = "dm-conversation-avatar"; avatar.textContent = label(conversation.peer).trim().charAt(0).toUpperCase() || "?";
      if (conversation.peer.avatar) { const image = document.createElement("img"); image.src = conversation.peer.avatar; image.alt = ""; avatar.replaceChildren(image); }
      copy.className = "dm-conversation-copy"; name.className = "dm-conversation-name"; name.textContent = label(conversation.peer); preview.className = "dm-conversation-preview"; preview.textContent = conversation.preview || "Start a conversation"; time.className = "dm-conversation-time"; time.textContent = relativeTime(conversation.timestamp); time.dateTime = new Date(conversation.timestamp).toISOString(); copy.append(name, preview); button.append(avatar, copy, time);
      if (conversation.unread > 0) { const badge = document.createElement("span"); badge.className = "dm-unread-badge"; badge.textContent = conversation.unread > 99 ? "99+" : String(conversation.unread); badge.setAttribute("aria-label", `${conversation.unread} unread messages`); button.append(badge); }
      button.addEventListener("click", () => { closeSidebar(); openConversation(conversation.peer.id); }); item.append(button); conversations.append(item);
    }
  }
  function openSidebar() { sidebar.classList.add("is-open"); sidebar.setAttribute("aria-hidden", "false"); backdrop.hidden = false; toggle.setAttribute("aria-expanded", "true"); refreshInbox(); }
  function closeSidebar() { sidebar.classList.remove("is-open"); sidebar.setAttribute("aria-hidden", "true"); backdrop.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
  function draw() {
    list.replaceChildren();
    for (const message of messages) {
      const item = document.createElement("li"); item.className = message.fromId === accountId ? "dm-message dm-mine" : "dm-message";
      const author = document.createElement("strong"), text = document.createElement("span"), time = document.createElement("time");
      author.textContent = message.fromId === accountId ? "You" : label([...contact.options].find(option => option.value === message.fromId)?.profile || {name:"Message"});
      text.textContent = message.text; time.textContent = new Intl.DateTimeFormat(undefined, {hour:"numeric", minute:"2-digit"}).format(message.timestamp); item.append(author, text, time); list.append(item);
    }
    list.scrollTop = list.scrollHeight;
  }
  function receive(message) {
    if (!message) return;
    refreshInbox();
    if (message.fromId !== peerId && message.toId !== peerId) return;
    const index = messages.findIndex(item => item.id === message.id); if (index < 0) messages.push(message); else messages[index] = message;
    messages.sort((a,b) => a.timestamp-b.timestamp); draw();
    if (message.fromId !== accountId && dialog.open) socket.emit("mark dm read", peerId, refreshInbox);
  }
  async function loadContacts(selected = "") {
    return new Promise(resolve => socket.emit("get dm contacts", result => {
      if (!result?.ok) { error.textContent = result?.error || "Could not load people."; resolve(false); return; }
      contact.replaceChildren(new Option("Choose a person…", ""));
      for (const profile of result.contacts) { const option = new Option(label(profile), profile.id); option.profile = profile; contact.add(option); }
      if (result.contacts.some(profile => profile.id === selected)) contact.value = selected;
      resolve(true);
    }));
  }
  function openConversation(id) {
    adminMode = false; adminView.hidden = !account?.admin; adminView.textContent = "Admin DM view"; form.hidden = false; input.disabled = false; error.textContent = "";
    dialog.showModal(); loadContacts(id).then(ok => { if (ok && id) loadThread(id); });
  }
  toggle.addEventListener("click", openSidebar); backdrop.addEventListener("click", closeSidebar);
  $("#dm-new").addEventListener("click", () => { closeSidebar(); openConversation(""); });
  $("#dm-close").addEventListener("click", () => dialog.close());
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeSidebar(); });
  function loadThread(id) {
    peerId = id; messages = []; draw(); error.textContent = ""; if (!id) return;
    socket.emit("get direct messages", id, result => {
      if (!result?.ok) { error.textContent = result?.error || "Could not load this conversation."; return; }
      if (peerId === id) { messages = result.messages; draw(); socket.emit("mark dm read", id, refreshInbox); }
    });
  }
  function loadAdminList() {
    error.textContent = ""; contact.disabled = true;
    socket.emit("admin get dm conversations", result => {
      contact.disabled = false; if (!result?.ok) { error.textContent = result?.error || "Could not load conversations."; return; }
      contact.replaceChildren(new Option("Choose a conversation…", ""));
      for (const pair of result.conversations) { const option = new Option(`${label(pair.a)} ↔ ${label(pair.b)}`, pair.key); option.pair = pair; contact.add(option); }
      list.replaceChildren(); messages = []; peerId = "";
    });
  }
  function loadAdminThread(option) {
    const pair = option?.pair; if (!pair) { list.replaceChildren(); return; }
    error.textContent = ""; socket.emit("admin get dm conversation", {a:pair.a.id, b:pair.b.id}, result => {
      if (!result?.ok) { error.textContent = result?.error || "Could not load this conversation."; return; }
      if (contact.selectedOptions[0] !== option) return;
      const profiles = new Map([[result.a.id,result.a],[result.b.id,result.b]]); messages = result.messages; list.replaceChildren();
      for (const message of messages) { const item = document.createElement("li"), author = document.createElement("strong"), text = document.createElement("span"), time = document.createElement("time"); item.className = "dm-message"; author.textContent = label(profiles.get(message.fromId) || {name:"Unknown"}); text.textContent = message.text; time.textContent = new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(message.timestamp); item.append(author,text,time); list.append(item); }
      list.scrollTop = list.scrollHeight;
    });
  }
  contact.addEventListener("change", () => adminMode ? loadAdminThread(contact.selectedOptions[0]) : loadThread(contact.value));
  adminView.addEventListener("click", () => {
    adminMode = !adminMode; adminView.textContent = adminMode ? "My DMs" : "Admin DM view"; form.hidden = adminMode; input.disabled = adminMode;
    if (adminMode) loadAdminList(); else { peerId = ""; messages = []; list.replaceChildren(); loadContacts(); }
  });
  form.addEventListener("submit", event => {
    event.preventDefault(); const text = input.value.trim(); if (!peerId || !text) return;
    const toId = peerId; input.disabled = true; socket.emit("direct message", {toId, text}, result => {
      input.disabled = false; if (!result?.ok) { error.textContent = result?.error || "Message could not be sent."; return; }
      if (peerId === toId) receive(result.message); input.value = ""; input.focus(); error.textContent = "";
    });
  });
  socket.on("direct message", receive);
  socket.on("connect", refreshInbox);
  const originalAcceptJoin = window.acceptJoin;
  // The app's join helper is local, so the first successful history event also refreshes the inbox.
  socket.on("history", refreshInbox);
})();