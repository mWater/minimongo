pako = require 'pako'
###
Gzips and base64 encodes JSON object if larger than 100 bytes
###
module.exports = (json) -> 
  str = JSON.stringify(json)
  if str and str.length > 100
    return btoa(pako.deflate(str, { to: "string" }))
  else
    return str