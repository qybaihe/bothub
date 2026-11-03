# sand-client-persistence 键编码

文件名 = `base32(utf8(key)).lower().rstrip("=") + ".blob"`

示例 key：`sand.client.slice.account.github%7Cuser_<ID>.roster.last-roster`

blob JSON 外壳：`{"schemaVersion":1,"value": ...}`
