const config = require('../../conf/config')
const Redis = require('ioredis')

const redisConfig = config.redis
function initRedisClient(cfg = redisConfig, RedisImpl = Redis) {
  if (cfg.cluster) { // https://github.com/luin/ioredis#cluster
    const clusterOptions = cfg.clusterOptions
    return new RedisImpl.Cluster(cfg.cluster, clusterOptions)
  }
  return new RedisImpl(cfg.url)
}

const redisClient = initRedisClient()

exports.redisClient = redisClient
exports.initRedisClient = initRedisClient
