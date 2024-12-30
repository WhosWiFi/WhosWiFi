const { animate } = require("https://cdn.jsdelivr.net/npm/framer-motion@11.11.11/dom/+esm");

animate(
  ".box",
  { rotate: 90 },
  { type: "spring", repeat: Infinity, repeatDelay: 0.2 }
);