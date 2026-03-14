import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextra from 'nextra'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const withNextra = nextra({
  search: {
    codeblocks: false
  }
})

export default withNextra({
  reactStrictMode: true,
  turbopack: {
    root: rootDir
  }
})
