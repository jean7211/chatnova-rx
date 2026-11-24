
/* ChatNova RX - Group Chat, Voice Messages and Push */

let selectedGroupId = "";
let chatGroups = [];
let mediaRecorder = null;
let audioChunks = [];
let recording = false;

const featureOriginalShowMessage = showMessage;
const featureOriginalEnterChat = enterChat;
const featureOriginalSendMessage = sendMessage;

function featureApi(url, options = {}) {
  return api(url, options);
}

function featureButton(label, action, className = "secondary") {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", action);
  return button;
}

/* CREATE GROUP AREA */

function buildGroupArea() {
  if ($("groupArea")) return;

  const heading = document.createElement("h3");
  heading.textContent = "👥 Group Chats";

  const area = document.createElement("div");
  area.id = "groupArea";
  area.style.padding = "0 8px";
  area.textContent = "Loading groups...";

  const createButton = document.createElement("button");
  createButton.textContent = "＋ Create Group";
  createButton.style.width = "calc(100% - 16px)";
  createButton.style.margin = "5px 8px";
  createButton.addEventListener("click", createChatGroup);

  const friendsHeading = $("friendsList");

  friendsHeading.parentNode.insertBefore(heading, friendsHeading);
  friendsHeading.parentNode.insertBefore(area, friendsHeading);
  friendsHeading.parentNode.insertBefore(createButton, friendsHeading);
}

async function loadChatGroups() {
  if (!$("groupArea")) buildGroupArea();

  try {
    chatGroups = await featureApi("/api/groups");
    renderChatGroups();
  } catch (error) {
    $("groupArea").textContent = "Could not load groups.";
    console.error(error);
  }
}

function renderChatGroups() {
  const area = $("groupArea");
  if (!area) return;

  area.innerHTML = "";

  if (!chatGroups.length) {
    area.textContent = "No groups yet.";
    return;
  }

  chatGroups.forEach(group => {
    const item = document.createElement("div");
    item.className = "user";

    if (selectedGroupId === group.id) item.classList.add("active");

    const name = document.createElement("b");
    name.textContent = "👥 " + group.name;

    const detail = document.createElement("small");
    detail.textContent = group.members.length + " members";

    item.append(name, detail);
    item.addEventListener("click", () => openChatGroup(group.id));

    area.appendChild(item);
  });
}

async function createChatGroup() {
  const name = prompt("Enter a name for your group:");
  if (!name || !name.trim()) return;

  const friendNames = friends.map(friend => friend.username);

  if (!friendNames.length) {
    alert("Add some friends before creating a group.");
    return;
  }

  const selected = prompt(
    "Enter friend usernames separated by commas:\n\n" +
    friendNames.join(", ")
  );

  if (selected === null) return;

  const members = selected.split(",")
    .map(name => name.trim())
    .filter(Boolean);

  try {
    const result = await featureApi("/api/groups", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        members
      })
    });

    await loadChatGroups();
    openChatGroup(result.group.id);
    alert("Group created successfully!");
  } catch (error) {
    alert(error.message);
  }
}

async function openChatGroup(groupId) {
  const group = chatGroups.find(item => item.id === groupId);
  if (!group) return;

  stopTyping();

  selectedGroupId = groupId;
  selectedUser = "";

  setConversation("group", "👥 " + group.name);

  $("status").textContent =
    group.members.length + " group members";

  $("publicButton").classList.remove("active");
  renderFriends();
  renderChatGroups();

  if (!socket || !socket.connected) {
    $("status").textContent = "Connecting...";
    return;
  }

  socket.emit("join group", groupId);

  try {
    const history = await featureApi(
      "/api/groups/" + encodeURIComponent(groupId) + "/messages"
    );

    if (chatType !== "group" || selectedGroupId !== groupId) return;

    $("messages").innerHTML = "";

    if (!history.length) {
      const empty = document.createElement("div");
      empty.id = "empty";
      empty.textContent = "Start your group conversation!";
      $("messages").appendChild(empty);
    } else {
      history.forEach(showMessage);
    }
  } catch (error) {
    $("messages").textContent = error.message;
  }
}

async function addGroupMember() {
  const group = chatGroups.find(item => item.id === selectedGroupId);
  if (!group) return;

  if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
    alert("Only the group creator can add members.");
    return;
  }

  const username = prompt("Enter the username of your friend to add:");
  if (!username) return;

  try {
    await featureApi(
      "/api/groups/" + encodeURIComponent(group.id) + "/members",
      {
        method: "POST",
        body: JSON.stringify({ username: username.trim() })
      }
    );

    await loadChatGroups();
    alert("Member added successfully!");
  } catch (error) {
    alert(error.message);
  }
}

/* GROUP MESSAGE EVENTS */

function attachGroupSocketEvents() {
  if (!socket) return;

  socket.off("group message");
  socket.on("group message", data => {
    if (
      chatType === "group" &&
      selectedGroupId === data.groupId
    ) {
      showMessage(data);
    }
  });

  socket.off("group added");
  socket.on("group added", async () => {
    await loadChatGroups();
  });
}

/* ADD GROUP BUTTON TO CHAT HEADER */

function buildGroupHeaderButton() {
  if ($("groupMemberButton")) return;

  const button = document.createElement("button");
  button.id = "groupMemberButton";
  button.textContent = "＋ Member";
  button.style.marginLeft = "auto";
  button.style.display = "none";
  button.addEventListener("click", addGroupMember);

  $("chatTitle").appendChild(button);
}

/* VOICE MESSAGE BUTTON */

function buildVoiceButton() {
  if ($("voiceButton")) return;

  const button = document.createElement("button");
  button.id = "voiceButton";
  button.className = "secondary";
  button.textContent = "🎤";
  button.title = "Record voice message";

  button.addEventListener("click", toggleVoiceRecording);

  $("sendbox").insertBefore(button, $("sendButton"));
}

async function toggleVoiceRecording() {
  if (recording) {
    mediaRecorder.stop();
    $("voiceButton").textContent = "⏳";
    $("voiceButton").disabled = true;
    return;
  }

  if (chatType !== "private" && chatType !== "group") {
    alert("Voice messages are available in private and group chats.");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Voice recording needs HTTPS and microphone permission.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    let mimeType = "";

    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      mimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
      mimeType = "audio/ogg;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      mimeType = "audio/mp4";
    }

    mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );

    audioChunks = [];
    recording = true;

    mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      recording = false;
      stream.getTracks().forEach(track => track.stop());

      $("voiceButton").disabled = false;
      $("voiceButton").textContent = "🎤";

      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm"
      });

      if (blob.size > 1000 * 1024) {
        alert("Voice message is too large. Please record a shorter message.");
        return;
      }

      if (!blob.size) {
        alert("No audio was recorded.");
        return;
      }

      try {
        const reader = new FileReader();

        reader.onload = () => {
          sendVoiceMessage(reader.result);
        };

        reader.readAsDataURL(blob);
      } catch (error) {
        alert("Could not prepare voice message.");
      }
    };

    mediaRecorder.start();
    $("voiceButton").textContent = "⏹ Stop";
    $("status").textContent = "🔴 Recording voice message...";

    setTimeout(() => {
      if (recording && mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, 45000);

  } catch (error) {
    alert("Microphone permission is required: " + error.message);
  }
}

function sendVoiceMessage(audioData) {
  if (!socket || !socket.connected) {
    alert("Not connected. Please try again.");
    return;
  }

  if (chatType === "private" && selectedUser) {
    socket.emit("private message", {
      to: selectedUser,
      type: "audio",
      audioData
    });
  } else if (chatType === "group" && selectedGroupId) {
    socket.emit("group message", {
      groupId: selectedGroupId,
      type: "audio",
      audioData
    });
  }

  $("status").textContent = "Voice message sent";
}

/* AUDIO AND GROUP MESSAGE DISPLAY */

showMessage = function(data) {
  if (!data) return;

  const empty = $("empty");
  if (empty) empty.remove();

  if (data.id && $("message-" + data.id)) return;

  const sender = data.from || data.name || "Unknown";
  const mine = sender.toLowerCase() === currentUser.toLowerCase();

  const box = document.createElement("div");
  box.className = "msg" + (mine ? " mine" : "");

  if (data.id) box.id = "message-" + data.id;

  if (chatType === "group" || chatType === "public") {
    const name = document.createElement("b");
    name.textContent = sender;
    box.appendChild(name);
  }

  if (data.type === "audio" && data.audioData) {
    const player = document.createElement("audio");
    player.controls = true;
    player.preload = "metadata";
    player.src = data.audioData;
    player.style.display = "block";
    player.style.maxWidth = "220px";
    player.style.width = "100%";
    box.appendChild(player);
  } else {
    const text = document.createElement("div");
    text.textContent = data.message || "";
    box.appendChild(text);
  }

  const time = document.createElement("small");
  const date = new Date(data.time);

  time.textContent = isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      });

  if (chatType === "private" && mine && data.id) {
    const receipt = document.createElement("span");
    receipt.className = "receipt" +
      (data.status === "read" ? " seen" : "");
    receipt.id = "receipt-" + data.id;
    receipt.textContent = data.status === "read"
      ? "✓✓ Seen"
      : "✓ Sent";
    time.appendChild(receipt);
  }

  box.appendChild(time);
  $("messages").appendChild(box);
  $("messages").scrollTop = $("messages").scrollHeight;
};

/* SEND GROUP TEXT MESSAGE */

sendMessage = function() {
  const input = $("messageInput");
  const message = input.value.trim();

  if (!message || !socket || !socket.connected) return;

  if (chatType === "group" && selectedGroupId) {
    socket.emit("group message", {
      groupId: selectedGroupId,
      message,
      type: "text"
    });
  } else {
    featureOriginalSendMessage();
    return;
  }

  input.value = "";
  stopTyping();
  input.focus();
};

/* PUSH NOTIFICATIONS */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

enableNotifications = async function() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported by this browser.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      alert("Please allow notifications in browser settings.");
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    const response = await featureApi("/api/push/public-key");

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(response.publicKey)
    });

    await featureApi("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription })
    });

    $("notifyButton").textContent = "🔔 Enabled";
    alert("ChatNova RX notifications enabled!");

  } catch (error) {
    console.error(error);
    alert("Could not enable notifications: " + error.message);
  }
};

/* STARTUP PATCH */

buildGroupArea();
buildVoiceButton();
buildGroupHeaderButton();

const featureOriginalSetConversation = setConversation;

setConversation = function(type, title) {
  featureOriginalSetConversation(type, title);

  $("groupMemberButton").style.display =
    type === "group" ? "inline-block" : "none";

  $("voiceButton").style.display =
    type === "private" || type === "group" ? "inline-block" : "none";
};

enterChat = async function(username) {
  await featureOriginalEnterChat(username);

  buildGroupArea();
  buildVoiceButton();
  buildGroupHeaderButton();

  attachGroupSocketEvents();
  await loadChatGroups();
};

if (currentUser) {
  loadChatGroups();
}

