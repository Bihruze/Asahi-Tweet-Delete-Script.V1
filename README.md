# Asahi – Tweet / Like / DM Delete Script (V1) (Fully Open Source)

This repository contains a fully open-source userscript that helps you bulk delete **Tweets, Likes, and Direct Messages** from your X (Twitter) account. Everything runs directly in your browser console, no extensions required.

---

## ✨ Features

- **Delete Likes** – via `like.js` from your X archive
- **Delete Tweets** – via `tweets.js` or `tweet-headers.js`
- **Delete DMs** – via `direct_message_*` files (1:1 and group conversations)
- **Skip Errors Automatically** – Already deleted or inaccessible items are ignored
- **Date Range Filtering** – Delete items within a specific date range, including the end date up to 23:59:59.999
- **Progress Save/Resume** – Save and resume deletion progress using localStorage
- **Anti-Spam Pacing** – Random delay ranges and breaks to mimic human behavior and avoid detection

---

## 📥 Before You Start: Download Your X Archive

1. Go to **Settings → Privacy & Security → Your Account → Download an Archive of Your Data**.
2. It usually takes 1–2 days to prepare; you’ll receive an email when ready.
3. Download and extract the ZIP. Inside you’ll typically find:
   - `data/tweets.js` or `data/tweet-headers.js`
   - `data/like.js`
   - `data/direct_message_headers.js`, `data/direct_message_group_headers.js`, `data/direct_messages.js`, `data/direct_message_groups.js`

---

## 🚀 How to Use (via Console)

1. Log into your X account and go to your **profile page** (`https://x.com/your_screen_name`).
2. Right-click anywhere on the page → **Inspect** → open the **Console** tab.
3. Open the script file from this repo, copy the entire code.
4. Paste it into the console and press **Enter**.
5. A small control panel will appear.
6. Choose the archive `.js` files you want to process (Likes, Tweets, DMs) and set a date range if needed.
7. Click **Start Deletion**. The script will process the selected files, removing items one by one with anti-spam safeguards.
8. Use the **Progress** button to resume or reset a previous session.

---

## 🗂 File Mapping

| Content to Delete | Archive Files                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Likes             | `data/like.js`                                                                                                                       |
| Tweets            | `data/tweets.js`, `data/tweet-headers.js`                                                                                            |
| Direct Messages   | `data/direct_message_headers.js`, `data/direct_message_group_headers.js`, `data/direct_messages.js`, `data/direct_message_groups.js` |

File names may vary depending on your archive version.

---

## 📈 Improvements and Security Measures

### Implemented Improvements
- **Updated Timing Intervals (v0.75.2)**  
  - Replaced fixed delays with random ranges to enhance anti-spam protection:
    - Likes: 1.8-3 seconds
    - Tweets: 2.5-5 seconds
    - DMs: 4-8 seconds
  - Random jitter (±30%) added to avoid predictable patterns.

- **Date Range Enhancement (v0.75.2)**  
  - The `to` date is now set to the end of the day (23:59:59.999), ensuring the full day is included in the range.

### Newly Added Security Features (v0.75.3 - Proposed)
Based on user feedback, the following critical security measures have been integrated:

1. **Pattern Breaking**  
   - A counter tracks operations, triggering a random break (30-90 seconds) every 15-25 operations to disrupt predictable activity patterns.

4. **Error Rate Tracking**  
   - Monitors failure rates during operations. If the error rate exceeds 20%, the script pauses for 1 hour to avoid triggering anti-spam measures.

6. **Human-Like Activity Simulation**  
   - Introduces a 15% chance of a 3-10 second "reading break" to simulate natural user behavior.

### Known Limitations and Future Improvements
- **Jitter Calculation:** The current jitter is linear; a non-linear distribution could improve natural variation.
- **Resume Consistency:** Resume mode recalculates `ids` from files, which may fail if the file changes. Strengthening file hash validation is recommended.
- **Performance:** Large files may slow down resume operations due to repeated parsing. A temporary cache (e.g., sessionStorage) could help.
- **Configurable Delays:** Users cannot adjust delay ranges via the UI. Adding min-max inputs would enhance flexibility.

---

## ⚠️ Disclaimer

This project is provided “as-is.” You are responsible for your account and content. The script is designed only for cleaning up **your own archive data**, not third-party content. Misuse may lead to account suspension. Use at your own risk.

### Security Notes
- Anti-spam measures (global pacing, jitter, pattern breaking, 429 handling) are enabled to reduce detection risk.
- Avoid running the script on multiple tabs simultaneously to prevent IP bans.
- The script uses a dynamic `authToken` from the page; ensure you are logged into X.

---

## 💜 Thanks

This project is open-source and free. If you find it useful, following [@asahi0x](https://x.com/asahi0x) is a nice way to say thanks 💜.

