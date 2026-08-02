export function iterate(obj, callback) {
  if (!obj || !obj.length) return
  for (let i = 0; i < obj.length; i++) {
    callback(obj[i], i)
  }
}
