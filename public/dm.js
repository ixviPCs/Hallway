(() => {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#dm-dialog"), contact = $("#dm-contact"), list = $("#dm-messages"), form = $("#dm-form"), input = $("#dm-input"), error = $("#dm-error"), adminView = $("#dm-admin-view");
  let peerId = "", messages = [], adminMode = false;
  adminView.hidden = !account?.admin;
  const label = (profile) => profile.nickname || profile.name;
  function draw() {
    list.replaceChildren();
    for (const message of messages) {
      const item = document.createElement("li");
      item.className = message.fromId === accountId ? "dm-message dm-mine" : "dm-message";
      const author = document.createElement("strong"), text = document.createElement("span"), time = document.createElement("time");
      author.textContent = message.fromId === accountId ? "You" : label([...contact.options].find(option => option.value === message.fromId)?.profile || {name:"Message"});
      text.textContent = message.text;
      time.textContent = new Intl.DateTimeFormat("en-US", {hour:"numeric", minute:"2-digit", hour12:true}).format(message.timestamp);
      item.append(author, text, time); list.append(item);
    }
    list.scrollTop = list.scrollHeight;
  }
  function receive(message) {
    if (!message || (message.fromId !== peerId && message.toId !== peerId)) return;
    const index = messages.findIndex(item => item.id === message.id);
    if (index < 0) messages.push(message); else messages[index] = message;
    messages.sort((a,b) => a.timestamp-b.timestamp); draw();
  }
  $("#dm-open").addEventListener("click", () => {
    adminView.hidden = !account?.admin; error.textContent = ""; dialog.showModal(); if (adminMode) { loadAdminList(); return; }
    socket.emit("get dm contacts", result => {
      if (!result?.ok) { error.textContent = result?.error || "Could not load people."; return; }
      const selected = contact.value; contact.replaceChildren(new Option("Choose a person…", ""));
      for (const profile of result.contacts) { const option = new Option(label(profile), profile.id); option.profile = profile; contact.add(option); }
      if (!adminMode) { if (result.contacts.some(profile => profile.id === selected)) contact.value = selected; if (contact.value) loadThread(contact.value); }
    });
  });
  function loadThread(id) {
    peerId = id; messages = []; draw(); error.textContent = "";
    if (!id) return;
    socket.emit("get direct messages", id, result => {
      if (!result?.ok) { error.textContent = result?.error || "Could not load this conversation."; return; }
      if (peerId === id) { messages = result.messages; draw(); }
    });
  }
  function loadAdminList() {
    error.textContent = ""; contact.disabled = true;
    socket.emit("admin get dm conversations", result => {
      contact.disabled = false;
      if (!result?.ok) { error.textContent = result?.error || "Could not load conversations."; return; }
      contact.replaceChildren(new Option("Choose a conversation…", ""));
      for (const pair of result.conversations) {
        const option = new Option(`${label(pair.a)} ↔ ${label(pair.b)}`, pair.key);
        option.pair = pair; contact.add(option);
      }
      list.replaceChildren(); messages = []; peerId = "";
    });
  }
  function loadAdminThread(option) {
    const pair = option?.pair; if (!pair) { list.replaceChildren(); return; }
    error.textContent = "";
    socket.emit("admin get dm conversation", {a:pair.a.id, b:pair.b.id}, result => {
      if (!result?.ok) { error.textContent = result?.error || "Could not load this conversation."; return; }
      if (contact.selectedOptions[0] !== option) return;
      const profiles = new Map([[result.a.id,result.a],[result.b.id,result.b]]);
      messages = result.messages;
      list.replaceChildren();
      for (const message of messages) {
        const item = document.createElement("li"), author = document.createElement("strong"), text = document.createElement("span"), time = document.createElement("time");
        item.className = "dm-message"; author.textContent = label(profiles.get(message.fromId) || {name:"Unknown"}); text.textContent = message.text;
        time.textContent = new Intl.DateTimeFormat("en-US", {hour:"numeric", minute:"2-digit", hour12:true}).format(message.timestamp);
        item.append(author,text,time); list.append(item);
      }
      list.scrollTop = list.scrollHeight;
    });
  }
  contact.addEventListener("change", () => adminMode ? loadAdminThread(contact.selectedOptions[0]) : loadThread(contact.value));
  adminView.addEventListener("click", () => {
    adminMode = !adminMode; adminView.textContent = adminMode ? "My DMs" : "Admin DM view";
    form.hidden = adminMode; input.disabled = adminMode;
    if (adminMode) loadAdminList(); else {
      peerId = ""; messages = []; list.replaceChildren(); contact.replaceChildren(new Option("Choose a person…", ""));
      socket.emit("get dm contacts", result => {
        if (!result?.ok) { error.textContent = result?.error || "Could not load people."; return; }
        for (const profile of result.contacts) { const option = new Option(label(profile), profile.id); option.profile = profile; contact.add(option); }
      });
    }
  });
  $("#dm-close").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", event => {
    event.preventDefault(); const text = input.value.trim();
    if (!peerId || !text) return;
    const toId = peerId; input.disabled = true;
    socket.emit("direct message", {toId, text}, result => {
      input.disabled = false;
      if (!result?.ok) { error.textContent = result?.error || "Message could not be sent."; return; }
      if (peerId === toId) receive(result.message);
      input.value = ""; input.focus(); error.textContent = "";
    });
  });
  socket.on("direct message", receive);
})();
