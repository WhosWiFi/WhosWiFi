const { animate, stagger, spring } = require('motion');

// General purpose animations that can be reused
const fadeInUp = (element, delay = 0) => {
  animate(element, {
    opacity: [0, 1],
    y: [20, 0]
  }, {
    delay,
    duration: 0.6,
    easing: spring()
  });
};

const staggerChildren = (parentSelector, childrenSelector) => {
  const elements = document.querySelectorAll(`${parentSelector} ${childrenSelector}`);
  animate(elements, {
    opacity: [0, 1],
    y: [20, 0]
  }, {
    delay: stagger(0.1),
    duration: 0.6,
    easing: spring()
  });
};

const hoverScale = (element) => {
  animate(element, {
    scale: 1.05,
  }, {
    duration: 0.2
  });
};

const resetScale = (element) => {
  animate(element, {
    scale: 1,
  }, {
    duration: 0.2
  });
};

// Export the animations
module.exports = {
  fadeInUp,
  staggerChildren,
  hoverScale,
  resetScale
};
