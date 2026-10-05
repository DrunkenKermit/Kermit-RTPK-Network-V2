const splashes = [
  "Weird-ahh site for the bored",
  "all hail Kermit",
  "The RTPK is strong with this one",
  "this is kermit heritage - andni",
  "Is kermit.dev ever gonna learn how to port?",
  "Swamp gooch",
  "more customizable than a sims character",
  "kermit was here",
  "If you read this you’re gay",
  "Sped CENTRAL",
  "I love devvy",
  "What are you waiting for DO SOMETHING",
  "WE are not doing our work are we",
  "RTPK stands for Rebellion of The People of Kermits",
];

const randomSplashN = Math.floor(Math.random() * splashes.length);
const randomSplash = splashes[randomSplashN];

const splashTextEl = document.getElementById("splash");
splashTextEl.innerHTML = randomSplash;
