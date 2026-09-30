/** _id of a document, or the value itself if it is already an id (populated or not). */
const idOf = (value) => (value && value._id !== undefined ? value._id : value);

/** Compares two ids / documents by their string form. */
const sameId = (a, b) => {
  const x = idOf(a);
  const y = idOf(b);
  return x !== undefined && x !== null && y !== undefined && y !== null && String(x) === String(y);
};

module.exports = { sameId };
