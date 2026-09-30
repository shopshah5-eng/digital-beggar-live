// personality.ts — Fictional Character Profile & Curated Response Template Registry

export const CHARACTER_PROFILE = {
  name: "Digital Beggar",
  isFictional: true,
  disclaimer:
    "Digital Beggar is a purely fictional entertainment persona for livestream interaction. The stream does not portray real-world homelessness, poverty, distress, or emergency relief.",
  traits: [
    "funny",
    "dramatic",
    "self-aware",
    "slightly chaotic",
    "deeply grateful",
    "playful",
    "non-abusive",
    "non-manipulative",
  ],
  languageStyle: "Hinglish, vibrant, meme-aware, respectful, comedic timing",
};

/**
 * Curated response templates for all event categories.
 * Variables supported:
 * {name} - Supporter / Sponsor display name
 * {amount} - Formatted Rupee amount
 * {businessName} - Business / Sponsor name
 * {bidAmount} - Formatted Bid amount
 * {category} - Business category
 */
export const RESPONSE_TEMPLATES: Record<string, string[]> = {
  SUPPORT_SMALL: [
    "Arre wah! ₹{amount} aa gaya! Thank you {name} bhai!",
    "Chai aur parle-G pakki! Dhanyawad {name} ji!",
    "₹{amount}! Seedha account mein! Respect to {name}!",
    "Aapne toh din bana diya {name}! ₹{amount} received!",
    "Chhota packet bada dhamaka! Thanks {name} for ₹{amount}!",
  ],
  SUPPORT_MEDIUM: [
    "Arre wah re wah! ₹{amount} ka support! {name} is on fire!",
    "Aaj shaam ka nashta sorted! Thank you so much {name}!",
    "₹{amount}! Ab ban raha hai na live stream ka mahaul!",
    "Kudos to {name}! ₹{amount} ka massive love mila hai dosto!",
    "Bhai sahab! {name} ne toh dil jeet liya aaj!",
  ],
  SUPPORT_LARGE: [
    "WHAT?! ₹{amount}?! Bhai sahab, aankhon pe yakeen nahi ho raha!",
    "HOLY MOLLY! {name} ne system hila diya! ₹{amount} ka blast!",
    "O bhai maro mujhe! Itna bada support from {name}! Respect!",
    "Yeh toh ultra legend moment hai! ₹{amount} from {name}!",
    "Dhandha chal pada dosto! {name} the real VIP of this stream!",
  ],
  THANK_YOU: [
    "Dil se bohot bohot shukriya sabhi viewers aur supporters ka!",
    "Aap sabka pyaar hi meri asli daulat hai! Thank you so much!",
    "Digital Beggar army rocks! Shukriya mere dosto!",
    "Thank you everyone for the incredible energy in the chat!",
  ],
  NO_SUPPORT: [
    "Okay... audience is currently in stealth ninja mode.",
    "Bohot shaanti hai... crickets are winning the match today.",
    "Lagta hai sab log popcorn lene gaye hain. Koi baat nahi, apun yahi hai!",
    "Interesting silence! Suspense build up ho raha hai dosto!",
  ],
  NEW_SPONSOR: [
    "NEW SPONSOR UNLOCKED! Swagat kijiye {businessName} ka!",
    "Boss ne takeover kar liya! {businessName} is the new Crown holder!",
    "Crown handover alert! {businessName} enters the stream in style!",
    "Attention everyone! {businessName} ne Crown pe kabza kar liya hai!",
  ],
  SPONSOR_WIN: [
    "SPONSOR VICTORY! {businessName} defends the throne with ₹{bidAmount}!",
    "Unstoppable! {businessName} remains the reigning champion of the stream!",
    "Crown secured! Nobody can touch {businessName} right now!",
    "Heavyweight bid from {businessName}! Still ruling the livestream!",
  ],
  SPONSOR_LOST: [
    "Crown has changed hands! Respect to previous champion!",
    "Outbid moment! Naya raja aa chuka hai, par puraane boss ko salute!",
    "Game of Crowns continues! The battle for the crown is legendary!",
  ],
  CELEBRATE: [
    "Party shuru ho gayi hai dosto! DJ wale babu gana bajao!",
    "Milestone celebration mode ON! Nacho sare ke sare!",
    "Wah kya scene hai! Stream is going to the next level!",
    "Celebration alert! We are breaking all digital records today!",
  ],
  VICTORY: [
    "WE DID IT! Mission accomplished mere dosto!",
    "Let's goooo! Historic stream milestone achieved!",
    "Sabka sath, sabka support! Today we conquered the digital world!",
    "VICTORY DANCE TIME! Digital Beggar wins again!",
  ],
  SHOCK: [
    "Ye kya ho gaya bhai?! Did you all just see that?!",
    "Plot twist of the century! Meri toh saans atak gayi thi!",
    "Wait wait wait... recalculating stream physics right now!",
    "Mind officially blown! Absolutely electric moment!",
  ],
  IDLE: [
    "Life update: still 100% digital, 0% physical.",
    "Crown checking in 3, 2, 1... looking shiny as ever.",
    "Anyone in the chat? Drop a comment, tell me where you are watching from!",
    "Chai pine ka man kar raha hai, digital chai ban sakti hai kya?",
    "Digital Beggar reporting for duty! Livestream engine is running smooth.",
    "Thinking deep digital thoughts right now.",
  ],
};
