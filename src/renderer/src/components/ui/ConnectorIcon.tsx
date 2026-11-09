import { useState } from 'react'
import { Calendar, Cloud, Database, Globe, Lock, Mail, MessageSquare, Plug, Terminal } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ConnectorIconProps {
  id?: string
  name?: string
  iconUrl?: string
  domain?: string
  className?: string
}

function normalizeProviderKey(id?: string, name?: string, domain?: string): string {
  const raw = `${id ?? ''} ${name ?? ''} ${domain ?? ''}`.toLowerCase()
  if (/\bgmail\b|google[\s_-]*mail|mail\.google/.test(raw)) return 'gmail'
  if (/google[\s_-]*calendar|\bgcal\b|calendar\.google/.test(raw)) return 'google_calendar'
  if (/google[\s_-]*contacts|contacts\.google/.test(raw)) return 'google_contacts'
  if (/google[\s_-]*drive|\bgdrive\b|drive\.google/.test(raw)) return 'google_drive'
  if (/google[\s_-]*docs|docs\.google/.test(raw)) return 'google_docs'
  if (/google[\s_-]*sheets|sheets\.google/.test(raw)) return 'google_sheets'
  if (/google[\s_-]*slides|slides\.google/.test(raw)) return 'google_slides'
  if (/google[\s_-]*forms|forms\.google/.test(raw)) return 'google_forms'
  if (/google[\s_-]*tasks|tasks\.google/.test(raw)) return 'google_tasks'
  if (/\bgoogle\b|youtube/.test(raw)) return 'google'
  if (/\bgithub\b/.test(raw)) return 'github'
  if (/\bslack\b/.test(raw)) return 'slack'
  if (/\bnotion\b/.test(raw)) return 'notion'
  if (/\blinear\b/.test(raw)) return 'linear'
  if (/\bdiscord\b/.test(raw)) return 'discord'
  if (/\btelegram\b|t\.me/.test(raw)) return 'telegram'
  if (/\bwhatsapp\b/.test(raw)) return 'whatsapp'
  if (/\boutlook\b|live\.com|hotmail/.test(raw)) return 'outlook'
  if (/\bmicrosoft\b|office\s*365|onedrive|sharepoint|teams/.test(raw)) return 'microsoft'
  if (/\bfigma\b/.test(raw)) return 'figma'
  if (/\bspotify\b/.test(raw)) return 'spotify'
  if (/\bdropbox\b/.test(raw)) return 'dropbox'
  if (/\bbox\b/.test(raw)) return 'box'
  if (/\bcalendly\b/.test(raw)) return 'calendly'
  if (/\bcanva\b/.test(raw)) return 'canva'
  if (/\bevernote\b/.test(raw)) return 'evernote'
  if (/\bfacebook\b/.test(raw)) return 'facebook'
  if (/\bthreads\b/.test(raw)) return 'threads'
  if (/\bghl\b|highlevel/.test(raw)) return 'ghl'
  if (/\bgranola\b/.test(raw)) return 'granola'
  if (/\bgumroad\b/.test(raw)) return 'gumroad'
  if (/\bklaviyo\b/.test(raw)) return 'klaviyo'
  if (/\blovable\b/.test(raw)) return 'lovable'
  if (/\bonepassword\b|1password/.test(raw)) return 'onepassword'
  if (/\bopentable\b/.test(raw)) return 'opentable'
  if (/\bpeloton\b/.test(raw)) return 'peloton'
  if (/philips[\s_-]*hue|\bhue\b/.test(raw)) return 'philips_hue'
  if (/\bprintify\b/.test(raw)) return 'printify'
  if (/\breadwise\b/.test(raw)) return 'readwise'
  if (/\breplit\b/.test(raw)) return 'replit'
  if (/\brunway\b/.test(raw)) return 'runway'
  if (/shop[\s_-]*pay/.test(raw)) return 'shop_pay'
  if (/\bshopify\b/.test(raw)) return 'shopify'
  if (/stripe[\s_-]*link|link\s+by\s+stripe/.test(raw)) return 'stripe_link'
  if (/\bstripe\b/.test(raw)) return 'stripe'
  if (/\btailscale\b/.test(raw)) return 'tailscale'
  if (/\btessie\b/.test(raw)) return 'tessie'
  if (/\bvercel\b/.test(raw)) return 'vercel'
  if (/\bvidiq\b/.test(raw)) return 'vidiq'
  if (/\bwithings\b/.test(raw)) return 'withings'
  if (/\bzapier\b/.test(raw)) return 'zapier'
  if (/\bgreenhouse\b/.test(raw)) return 'greenhouse'
  if (/\bramp\b/.test(raw)) return 'ramp'
  if (/\bjira\b|\batlassian\b|\bconfluence\b/.test(raw)) return 'jira'
  if (/\basana\b/.test(raw)) return 'asana'
  if (/\btrello\b/.test(raw)) return 'trello'
  if (/\btodoist\b/.test(raw)) return 'todoist'
  if (/\b(x|twitter)\b|x\.com|twitter\.com/.test(raw)) return 'x'
  if (/\blinkedin\b/.test(raw)) return 'linkedin'
  if (/\bzoom\b/.test(raw)) return 'zoom'
  if (/\binstagram\b/.test(raw)) return 'instagram'
  if (/\bmessenger\b/.test(raw)) return 'messenger'
  if (/\bmeta\b/.test(raw)) return 'meta'
  if (/\bapple\b|\bicloud\b/.test(raw)) return 'apple'
  if (/\bsalesforce\b/.test(raw)) return 'salesforce'
  if (/\bhubspot\b/.test(raw)) return 'hubspot'
  if (/\bcalendar\b|\bcaldav\b|\bical\b/.test(raw)) return 'calendar'
  if (/\bmail\b|\bmailbox\b|\bemail\b|\bimap\b|\bsmtp\b/.test(raw)) return 'mail'
  if (/\bbrowser\b|\bweb\b|\bsearch\b|\bhttp\b/.test(raw)) return 'web'
  if (/\bshell\b|\bterminal\b|\bbash\b|\bcode\b|\bmcp\b/.test(raw)) return 'terminal'
  if (/\bsql\b|\bdatabase\b|\bpostgres\b|\bsupabase\b/.test(raw)) return 'database'
  return ''
}

function BrandSvg({ provider }: { provider: string }) {
  switch (provider) {
    case 'google':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.06v2.6A9.99 9.99 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.41 13.9a6.01 6.01 0 0 1 0-3.8V7.5H3.06a9.99 9.99 0 0 0 0 9l3.35-2.6Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.98c1.47 0 2.78.5 3.82 1.5l2.86-2.86C16.96 2.99 14.7 2 12 2A9.99 9.99 0 0 0 3.06 7.5l3.35 2.6C7.2 7.74 9.4 5.98 12 5.98Z"
          />
        </svg>
      )
    case 'gmail':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#4285F4" d="M2 6.5V18a2 2 0 0 0 2 2h2V9.8l6 4.5 6-4.5V20h2a2 2 0 0 0 2-2V6.5L12 14 2 6.5Z" />
          <path fill="#EA4335" d="M20 4H4a2 2 0 0 0-2 2.5L12 14l10-7.5A2 2 0 0 0 20 4Z" />
          <path fill="#34A853" d="M18 14.3V20h2a2 2 0 0 0 2-2v-6.7l-4 3Z" />
          <path fill="#FBBC05" d="M2 11.3V18a2 2 0 0 0 2 2h2v-5.7l-4-3Z" />
        </svg>
      )
    case 'google_calendar':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="3" fill="#4285F4" />
          <path d="M3 9h18v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9Z" fill="#fff" />
          <rect x="3" y="4" width="18" height="5" rx="2" fill="#1967D2" />
          <text
            x="12"
            y="17.2"
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fill="#1967D2"
            fontFamily="system-ui, sans-serif"
          >
            31
          </text>
        </svg>
      )
    case 'google_contacts':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#1A73E8" />
          <circle cx="12" cy="9.5" r="3" fill="#fff" />
          <path d="M6.8 17.5c1.1-2.1 3-3.3 5.2-3.3s4.1 1.2 5.2 3.3" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'google_drive':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#0F9D58" d="M9.05 3.5h5.9l6.55 11.35h-5.9L9.05 3.5Z" />
          <path fill="#4285F4" d="M5.45 14.85h16.05L18.55 20H2.5l2.95-5.15Z" />
          <path fill="#F4B400" d="M9.05 3.5 2.5 14.85 5.45 20 12 8.65 9.05 3.5Z" />
        </svg>
      )
    case 'google_docs':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="4" y="2" width="16" height="20" rx="2.5" fill="#4285F4" />
          <path d="M7.5 8h9M7.5 12h9M7.5 16h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'google_sheets':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="4" y="2" width="16" height="20" rx="2.5" fill="#0F9D58" />
          <path d="M7.5 8h9v8h-9V8Zm4.5 0v8M7.5 12h9" stroke="#fff" strokeWidth="1.5" fill="none" />
        </svg>
      )
    case 'google_slides':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="4" y="2" width="16" height="20" rx="2.5" fill="#F4B400" />
          <rect x="7" y="8" width="10" height="7" rx="1" stroke="#fff" strokeWidth="1.7" fill="none" />
        </svg>
      )
    case 'google_forms':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="4" y="2" width="16" height="20" rx="2.5" fill="#7248B9" />
          <circle cx="8" cy="9" r="1" fill="#fff" />
          <circle cx="8" cy="13" r="1" fill="#fff" />
          <circle cx="8" cy="17" r="1" fill="#fff" />
          <path d="M11 9h5.5M11 13h5.5M11 17h4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'google_tasks':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#1A73E8" />
          <path d="m8 12.2 2.6 2.6 5.6-5.6" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'github':
      return (
        <svg viewBox="0 0 24 24" className="size-4 fill-current text-ink" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
        </svg>
      )
    case 'slack':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#E01E5A" d="M6 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
          <path fill="#36C5F0" d="M9 6a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
          <path fill="#2EB67D" d="M18 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
          <path fill="#ECB22E" d="M15 18a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
        </svg>
      )
    case 'notion':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3.5" fill="currentColor" className="text-ink" />
          <path
            d="M8 7.5h2.2l4.1 6.2V7.5H16v9h-2.1L9.7 10.2v6.3H8v-9Z"
            fill="var(--color-surface, #fff)"
          />
        </svg>
      )
    case 'linear':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#5E6AD2" />
          <path
            d="M5.5 14.5 9.5 18.5M4.5 10.5l9 9M7 6.5l10.5 10.5"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#5865F2"
            d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.02.06.03.09.02 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02ZM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12Zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12Z"
          />
        </svg>
      )
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#26A5E4" />
          <path
            fill="#fff"
            d="m16.8 7.6-1.9 9.1c-.14.64-.52.8-1.05.5l-2.9-2.14-1.4 1.35c-.15.15-.28.28-.58.28l.21-2.96 5.38-4.86c.23-.21-.05-.33-.36-.12l-6.65 4.19-2.86-.9c-.62-.2-.63-.62.13-.92l11.18-4.31c.52-.19.97.12.8.8Z"
          />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#25D366"
            d="M12 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.15-1.45A9.9 9.9 0 1 0 12 2Zm5.4 14.12c-.23.64-1.34 1.22-1.85 1.3-.48.07-1.1.1-1.78-.12-.41-.13-.94-.31-1.62-.6-2.84-1.23-4.7-4.1-4.84-4.29-.14-.19-1.15-1.53-1.15-2.92 0-1.39.73-2.07.99-2.35.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.17.01.41-.06.64.49.23.56.8 1.95.87 2.09.07.14.12.3.02.49-.1.19-.14.3-.28.47-.14.16-.3.36-.42.49-.14.14-.29.29-.13.57.16.28.73 1.2 1.56 1.94 1.08.96 1.98 1.26 2.26 1.4.28.14.44.12.61-.07.16-.19.7-.82.89-1.1.19-.28.38-.23.63-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.16 1.32Z"
          />
        </svg>
      )
    case 'microsoft':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="8.5" height="8.5" fill="#F25022" />
          <rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00" />
          <rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF" />
          <rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900" />
        </svg>
      )
    case 'outlook':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="6" y="4" width="15" height="16" rx="2" fill="#0078D4" />
          <path d="m6 8 7.5 4.8L21 8" stroke="#fff" strokeWidth="1.5" fill="none" />
          <rect x="2.5" y="7" width="9" height="10" rx="1.8" fill="#0364B8" />
          <circle cx="7" cy="12" r="2.5" stroke="#fff" strokeWidth="1.6" fill="none" />
        </svg>
      )
    case 'figma':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#F24E1E" d="M8.5 2h3.5v6.5H8.5a3.25 3.25 0 1 1 0-6.5Z" />
          <path fill="#FF7262" d="M12 2h3.5a3.25 3.25 0 1 1 0 6.5H12V2Z" />
          <path fill="#A259FF" d="M8.5 8.5H12V15H8.5a3.25 3.25 0 1 1 0-6.5Z" />
          <circle cx="15.25" cy="11.75" r="3.25" fill="#1ABCFE" />
          <path fill="#0ACF83" d="M8.5 15H12v3.25a3.25 3.25 0 1 1-3.5-3.25Z" />
        </svg>
      )
    case 'spotify':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#1DB954" />
          <path
            d="M7.2 9.4c3.2-1 6.9-.8 9.8.9M7.8 12.6c2.6-.7 5.6-.5 7.9.8M8.4 15.6c2-.5 4.2-.4 6 .6"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )
    case 'dropbox':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#0061FF"
            d="M7.2 3.5 2 6.8l5.2 3.3L12 6.8 7.2 3.5Zm9.6 0L12 6.8l4.8 3.3L22 6.8l-5.2-3.3ZM2 13.4l5.2 3.3L12 13.4l-4.8-3.3L2 13.4Zm14.8-3.3L12 13.4l4.8 3.3L22 13.4l-5.2-3.3ZM12 14.9l-4.8 3.3L12 21.5l4.8-3.3-4.8-3.3Z"
          />
        </svg>
      )
    case 'box':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="2.5" y="4" width="19" height="16" rx="3.5" fill="#0061D5" />
          <circle cx="9.2" cy="12.5" r="2.7" stroke="#fff" strokeWidth="1.8" fill="none" />
          <path d="M5.8 8.5v6.7M14.5 10l3.6 5M18.1 10l-3.6 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'calendly':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" stroke="#006BFF" strokeWidth="2.4" fill="none" />
          <path d="M14.8 9.2a4 4 0 1 0 0 5.6" stroke="#006BFF" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'canva':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <defs>
            <linearGradient id="canvaGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00C4CC" />
              <stop offset="100%" stopColor="#7D2AE8" />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="10" fill="url(#canvaGrad)" />
          <path d="M14.8 8.5a4.2 4.2 0 1 0 0 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'evernote':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#00A82D" />
          <path d="M8 7.5h8v2H10v1.8h5v2h-5v1.8h6v2H8v-9.6Z" fill="#fff" />
        </svg>
      )
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#1877F2" />
          <path
            fill="#fff"
            d="M15.1 12.8h-2v7h-2.9v-7H8.5v-2.5h1.7V8.6c0-2 1.1-3.1 3-3.1.9 0 1.8.15 1.8.15v2h-1c-1 0-1.3.62-1.3 1.25v1.4h2.2l-.3 2.5Z"
          />
        </svg>
      )
    case 'threads':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="currentColor" className="text-ink" />
          <path
            d="M14.8 11.8c-.2-2-1.5-3.1-3.3-3.1-2 0-3.5 1.5-3.5 3.6s1.5 3.6 3.6 3.6c1.6 0 2.7-.7 3.1-1.9M12.2 10.6c1.2 0 2 .7 2 1.7 0 1-.8 1.7-2 1.7-1.1 0-1.9-.6-1.9-1.5 0-.9.8-1.9 1.9-1.9Z"
            stroke="var(--color-surface, #fff)"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )
    case 'ghl':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#155EEF" />
          <path d="m7 14 5-5 5 5M7 18l5-5 5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'granola':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#10B981" />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'gumroad':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#FF90E8" stroke="#111" strokeWidth="1.5" />
          <path d="M14.8 9.5a3.5 3.5 0 1 0 .2 4.2h-2.8" stroke="#111" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'klaviyo':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path d="M4 5h16l-3.5 7L20 19H4V5Z" fill="#111827" />
        </svg>
      )
    case 'lovable':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#FF4F8B"
            d="M12 20.5s-7-4.35-7-9.85A4.15 4.15 0 0 1 12 7.6a4.15 4.15 0 0 1 7 3.05c0 5.5-7 9.85-7 9.85Z"
          />
        </svg>
      )
    case 'onepassword':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#0A85EA" />
          <circle cx="12" cy="12" r="6" stroke="#fff" strokeWidth="1.6" fill="none" />
          <rect x="11" y="8.5" width="2" height="7" rx="1" fill="#fff" />
        </svg>
      )
    case 'opentable':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#DA3743" />
          <circle cx="8" cy="12" r="1.8" fill="#fff" />
          <circle cx="14.5" cy="12" r="3.6" stroke="#fff" strokeWidth="2" fill="none" />
        </svg>
      )
    case 'peloton':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#DF1C2F" />
          <path d="M9 17V7h4a3 3 0 0 1 0 6H9" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'philips_hue':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="10" r="6" fill="#F59E0B" />
          <path d="M9.5 16h5v2.5a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5V16Z" fill="#6B7280" />
        </svg>
      )
    case 'printify':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#39B54A" />
          <path d="M9 17V7h4.2a3 3 0 0 1 0 6H9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'readwise':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#F59E0B" />
          <path d="M8 7.5h4.5a2.5 2.5 0 0 1 0 5H8v-5Zm0 5h4l3 4.5M8 7.5v9.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'replit':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="5" y="3.5" width="7" height="5.5" rx="1.5" fill="#F26207" />
          <rect x="12" y="9" width="7" height="5.5" rx="1.5" fill="#F26207" />
          <rect x="5" y="14.5" width="7" height="5.5" rx="1.5" fill="#F26207" />
        </svg>
      )
    case 'runway':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#111827" />
          <path d="M8 16.5V7.5h4.5a2.5 2.5 0 0 1 0 5H8m4.2 0 3.3 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'shopify':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#95BF47" d="M6 7.5 16.5 6l1.5 14H4.5L6 7.5Z" />
          <path d="M9.5 7V5.8a2.5 2.5 0 0 1 5 0V7" stroke="#5E8E3E" strokeWidth="1.6" fill="none" />
          <path d="M13 11c-1.5-.6-2.8.2-2.8 1.2 0 1.6 3 1.2 3 3 0 1.1-1.2 1.8-2.8 1.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'shop_pay':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="4" fill="#5A31F4" />
          <path d="M14.2 9.5c-1.5-.7-4-.5-4 1.1 0 2 4.3 1.2 4.3 3.4 0 1.6-2.5 2-4.4 1.1" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'stripe':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#635BFF" />
          <path d="M14.8 9.2c-1.6-.8-4.8-.6-4.8 1.4 0 2.5 5.2 1.5 5.2 4.2 0 2-3 2.5-5.3 1.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'stripe_link':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#00D66F" />
          <path d="M8 15.5 15.5 8M10 8h5.5v5.5" stroke="#062E1E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'tailscale':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="7" cy="7" r="1.8" fill="#9CA3AF" />
          <circle cx="12" cy="7" r="1.8" fill="currentColor" className="text-ink" />
          <circle cx="17" cy="7" r="1.8" fill="#9CA3AF" />
          <circle cx="7" cy="12" r="1.8" fill="currentColor" className="text-ink" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" className="text-ink" />
          <circle cx="17" cy="12" r="1.8" fill="currentColor" className="text-ink" />
          <circle cx="7" cy="17" r="1.8" fill="#9CA3AF" />
          <circle cx="12" cy="17" r="1.8" fill="currentColor" className="text-ink" />
          <circle cx="17" cy="17" r="1.8" fill="#9CA3AF" />
        </svg>
      )
    case 'tessie':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#E82127" />
          <path d="M7 8.5h10M12 8.5v8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )
    case 'vercel':
      return (
        <svg viewBox="0 0 24 24" className="size-4 fill-current text-ink" aria-hidden="true">
          <path d="M12 4 21 19.5H3L12 4Z" />
        </svg>
      )
    case 'vidiq':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#0066FF" />
          <path d="m10 8.5 6 3.5-6 3.5v-7Z" fill="#fff" />
        </svg>
      )
    case 'withings':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#00B5AD" />
          <path d="M5.5 12h3l2-4 3 8 2-4h3" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'zapier':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="#FF4F00" />
          <path d="M7 12h10M12 7v10M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'greenhouse':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#24A47F" />
          <path d="M14.8 9.2a4 4 0 1 0 .2 4.5h-3" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'ramp':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#141414" />
          <path d="M7.5 16.5 16.5 7.5M10 7.5h6.5V14" stroke="#E4F222" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'jira':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#2684FF"
            d="M11.5 3 4 10.5l4.2 4.2 3.3-3.3 3.3 3.3 4.2-4.2L11.5 3Zm0 7.4L7.3 14.6l4.2 4.2 4.2-4.2-4.2-4.2Z"
          />
        </svg>
      )
    case 'asana':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="12" cy="6.8" r="3.6" fill="#F06A6A" />
          <circle cx="6.8" cy="15.8" r="3.6" fill="#F06A6A" />
          <circle cx="17.2" cy="15.8" r="3.6" fill="#F06A6A" />
        </svg>
      )
    case 'trello':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" fill="#0079BF" />
          <rect x="6" y="6" width="4.8" height="11" rx="1.2" fill="#fff" />
          <rect x="13.2" y="6" width="4.8" height="7" rx="1.2" fill="#fff" />
        </svg>
      )
    case 'todoist':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#E44332" />
          <path
            d="m6 9.5 3.5 2 6.5-3.8M6 13.5l3.5 2 6.5-3.8"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      )
    case 'x':
      return (
        <svg viewBox="0 0 24 24" className="size-3.5 fill-current text-ink" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" fill="#0A66C2" />
          <path
            fill="#fff"
            d="M8.3 10.2v6.5H6.1v-6.5h2.2Zm.1-2c0 .65-.49 1.17-1.26 1.17-.75 0-1.24-.52-1.24-1.17 0-.66.5-1.17 1.26-1.17.76 0 1.24.51 1.24 1.17Zm9.5 4.8v3.7h-2.2v-3.45c0-.87-.31-1.46-1.1-1.46-.6 0-.95.4-1.11.8-.06.14-.07.33-.07.53v3.58H11.2s.03-5.82 0-6.5h2.2v.92c.29-.45.81-1.08 1.98-1.08 1.45 0 2.52.94 2.52 2.96Z"
          />
        </svg>
      )
    case 'zoom':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="4.5" fill="#2D8CFF" />
          <path
            fill="#fff"
            d="M6.5 9h6.8a1.7 1.7 0 0 1 1.7 1.7v4.3H8.2A1.7 1.7 0 0 1 6.5 13.3V9Zm9.3 1.8 2.7-1.9v6.2l-2.7-1.9v-2.4Z"
          />
        </svg>
      )
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="#E1306C" />
          <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.8" fill="none" />
          <circle cx="17" cy="7" r="1.1" fill="#fff" />
        </svg>
      )
    case 'messenger':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#0084FF"
            d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.2 5.42 3.15 7.17.16.14.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.99-.88c.17-.08.36-.1.55-.05.91.25 1.88.39 2.87.39 5.64 0 10-4.13 10-9.7S17.64 2 12 2Zm5.98 7.52-2.93 4.65a1.5 1.5 0 0 1-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.39c-.42.32-.97-.19-.69-.64l2.93-4.65a1.5 1.5 0 0 1 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.39c.42-.32.97.19.69.64Z"
          />
        </svg>
      )
    case 'meta':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            d="M4.5 14.5c0-3.2 2.1-6 4.5-6 1.5 0 2.7 1.1 4.1 3.3 1.4 2.2 2.4 3.2 3.6 3.2 1.6 0 2.8-1.4 2.8-3.4 0-2.1-1.3-3.6-2.9-3.6-1.1 0-2.1.7-3.2 2.3"
            stroke="#0081FB"
            strokeWidth="2.1"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )
    case 'apple':
      return (
        <svg viewBox="0 0 24 24" className="size-4 fill-current text-ink" aria-hidden="true">
          <path d="M16.36 12.77c.02 2.36 2.07 3.15 2.09 3.16-.02.06-.33 1.12-1.08 2.22-.65.95-1.32 1.9-2.39 1.92-1.05.02-1.38-.62-2.58-.62-1.2 0-1.57.6-2.56.64-1.03.04-1.81-1.03-2.47-1.98-1.34-1.94-2.37-5.48-.99-7.88.68-1.19 1.91-1.95 3.24-1.97 1.01-.02 1.96.68 2.58.68.62 0 1.78-.84 3.01-.72.51.02 1.95.21 2.87 1.56-.07.05-1.72 1-1.7 3.01ZM14.4 6.95c.55-.66.92-1.58.82-2.5-.79.03-1.75.53-2.32 1.19-.5.58-.95 1.52-.83 2.41.88.07 1.78-.45 2.33-1.1Z" />
        </svg>
      )
    case 'salesforce':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#00A1E0"
            d="M10.2 6.2a4.3 4.3 0 0 1 6.7 1.1 3.7 3.7 0 0 1 4.1 3.7c0 .3-.04.6-.12.9a3.5 3.5 0 0 1-.88 6.9H6.2a4 4 0 0 1-.7-7.94 4.1 4.1 0 0 1 4.7-4.66Z"
          />
        </svg>
      )
    case 'hubspot':
      return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <circle cx="13.5" cy="12.5" r="4" stroke="#FF7A59" strokeWidth="2.2" fill="none" />
          <circle cx="13.5" cy="4.5" r="1.7" fill="#FF7A59" />
          <circle cx="6" cy="17.5" r="2" fill="#FF7A59" />
          <path d="M13.5 6.2v2.3M10.2 14.8l-2.7 1.7" stroke="#FF7A59" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'calendar':
      return <Calendar className="size-4 text-accent-600" aria-hidden="true" />
    case 'mail':
      return <Mail className="size-4 text-accent-600" aria-hidden="true" />
    case 'web':
      return <Globe className="size-4 text-accent-600" aria-hidden="true" />
    case 'terminal':
      return <Terminal className="size-4 text-accent-600" aria-hidden="true" />
    case 'database':
      return <Database className="size-4 text-accent-600" aria-hidden="true" />
    default:
      return null
  }
}

export function ConnectorIcon({ id, name, iconUrl, domain, className }: ConnectorIconProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const provider = normalizeProviderKey(id, name, domain)

  const resolvedUrl =
    iconUrl && !imgFailed
      ? iconUrl.startsWith('/')
        ? `https://app.hark.com${iconUrl}`
        : iconUrl
      : undefined

  return (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface shadow-2xs',
        className
      )}
    >
      {provider ? (
        <BrandSvg provider={provider} />
      ) : resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt=""
          onError={() => setImgFailed(true)}
          className="size-4 rounded-xs object-contain"
        />
      ) : domain ? (
        <Lock className="size-3.5 text-ink-secondary" aria-hidden="true" />
      ) : (
        <Plug className="size-3.5 text-ink-secondary" aria-hidden="true" />
      )}
    </span>
  )
}
export { MessageSquare, Cloud }
