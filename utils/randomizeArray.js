const fs = require("node:fs/promises");

const wordsCollection = require("./random.json");

(async () => {
  const words = Object.keys(wordsCollection);

  // eslint-disable-next-line no-plusplus
  for (let i = words.length; i >= 1; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  const fileRef = await fs.open("./utils/random.json", "w");
  await fileRef.writeFile(JSON.stringify(words));
})();
