# Asahi – Tweet / Like / DM Delete Script (V1) (Fully Open Source)

This repository contains a fully open-source userscript that helps you bulk delete **Tweets, Likes, and Direct Messages** from your X (Twitter) account. Everything runs directly in your browser console, no extensions required.

---

## ✨ Features

* **Delete Likes** – via `like.js` from your X archive
* **Delete Tweets** – via `tweets.js` or `tweet-headers.js`
* **Delete DMs** – via `direct_message_*` files (1:1 and group conversations)
* **Skip errors automatically** – already deleted or inaccessible items are ignored

---

## 📥 Before You Start: Download Your X Archive

1. Go to **Settings → Privacy & Security → Your Account → Download an Archive of Your Data**.
2. It usually takes 1–2 days to prepare; you’ll receive an email when ready.
3. Download and extract the ZIP. Inside you’ll typically find:

   * `data/tweets.js` or `data/tweet-headers.js`
   * `data/like.js`
   * `data/direct_message_headers.js`, `data/direct_message_group_headers.js`, `data/direct_messages.js`, `data/direct_message_groups.js`

---

## 🚀 How to Use (via Console)

1. Log into your X account and go to your **profile page** (`https://x.com/your_screen_name`).
2. Right-click anywhere on the page → **Inspect** → open the **Console** tab.
3. Open the script file from this repo, copy the entire code.
4. Paste it into the console and press **Enter**.
5. A small control panel will appear.
6. Choose the archive `.js` files you want to process (Likes, Tweets, DMs).
7. Click **Start Deletion**. The script will go through the selected files and remove items one by one.

---

## 🗂 File Mapping

| Content to Delete | Archive Files                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Likes             | `data/like.js`                                                                                                                       |
| Tweets            | `data/tweets.js`, `data/tweet-headers.js`                                                                                            |
| Direct Messages   | `data/direct_message_headers.js`, `data/direct_message_group_headers.js`, `data/direct_messages.js`, `data/direct_message_groups.js` |

File names may vary depending on your archive version.

---

## ⚠️ Disclaimer

This project is provided “as-is.” You are responsible for your account and content.
The script is designed only for cleaning up **your own archive data**, not third-party content.

---

## 💜 Thanks

This project is open-source and free.
If you find it useful, following [@asahi0x](https://x.com/asahi0x) is a nice way to say thanks 💜.



