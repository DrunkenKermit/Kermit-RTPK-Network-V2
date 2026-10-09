const splashes = [
  "Weird little site for the bored",
  "all hail Kermit",
  "The RTPK is strong with this one",
  "this is kermit heritage - andni",
  "Is kermit.dev ever gonna learn how to port?",
  "Swamp vibes",
  "more customizable than a sims character",
  "kermit was here",
  "I love devvy",
  "What are you waiting for DO SOMETHING",
  "WE are not doing our work are we",
  "RTPK stands for Rebellion of The People of Kermits",
];

const splashTextEl = document.getElementById("splash");

// Start on a random line, then move to a different one every 7.5 seconds.
let splashIndex = Math.floor(Math.random() * splashes.length);

function showSplash() {
  splashTextEl.innerHTML = splashes[splashIndex];
}

showSplash();

setInterval(function () {
  splashIndex = (splashIndex + 1) % splashes.length;
  showSplash();
}, 7500);
