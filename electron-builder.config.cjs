// electron-builder config (was the "build" key in package.json).
// Signing is optional: without the secrets below every build is unsigned,
// exactly like the earlier manual releases.
//   macOS:   CSC_LINK, CSC_KEY_PASSWORD (+ APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD,
//            APPLE_TEAM_ID to notarize)
//   Windows: WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD
const has = (name) => Boolean(process.env[name] && process.env[name].trim())
const macSigned = has('CSC_LINK')
const notarize = macSigned && has('APPLE_ID') && has('APPLE_APP_SPECIFIC_PASSWORD') && has('APPLE_TEAM_ID')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.qybaihe.bothub',
  productName: 'BotHub',
  copyright: 'Copyright © 2026 BotHub contributors',
  directories: {
    output: 'release',
    buildResources: 'build'
  },
  files: ['out/**/*', 'package.json'],
  asar: true,
  mac: {
    category: 'public.app-category.productivity',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      // zip is what electron-updater reads on macOS (latest-mac.yml).
      { target: 'zip', arch: ['arm64', 'x64'] }
    ],
    // null = skip signing entirely (unsigned build, as before).
    identity: macSigned ? undefined : null,
    hardenedRuntime: macSigned,
    gatekeeperAssess: false,
    notarize,
    artifactName: '${productName}-${version}-${arch}.${ext}'
  },
  dmg: {
    artifactName: '${productName}-${version}-${arch}.${ext}'
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png',
    artifactName: '${productName}-Setup-${version}-${arch}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Keep the user's data (accounts, sessions) on uninstall.
    deleteAppDataOnUninstall: false
  },
  publish: [
    {
      provider: 'github',
      owner: 'qybaihe',
      repo: 'bothub',
      // CI creates the draft first and every platform job uploads into it,
      // then one final step publishes. No job ever creates the release, so
      // parallel uploads cannot race into a 422.
      releaseType: 'draft'
    }
  ]
}
