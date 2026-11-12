import { exchange } from '../exchange.js'

export default {
  fetch(request) {
    return exchange(request, process.env)
  },
}
