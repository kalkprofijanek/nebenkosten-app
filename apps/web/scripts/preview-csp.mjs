const contentSecurityPolicyMetaPattern =
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/>/g

export function replacePreviewContentSecurityPolicy(
  html,
  contentSecurityPolicy,
) {
  const policyMetas = html.match(contentSecurityPolicyMetaPattern) ?? []
  if (policyMetas.length !== 1) {
    throw new Error(
      'The Vite output must contain exactly one Content Security Policy.',
    )
  }
  if (!contentSecurityPolicy || /["<>]/.test(contentSecurityPolicy)) {
    throw new Error('The preview Content Security Policy is invalid.')
  }

  return html.replace(
    policyMetas[0],
    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
  )
}
