import { useEffect } from "react";

const sections = [
  { id: "information", title: "Information we use", paragraphs: [
    "You can browse stations and listen without an account. When you sign in, atradio.fm uses your AT Protocol identifier (DID), handle, and public profile information, including your display name and avatar.",
    "Connected features use your favorites, station registrations, comments, GIF selections, emoji reactions, listening activity, and audio settings. Listening activity includes the station and playback timestamp and is used for recently played lists, listening history, and unique-listener counts. Notifications are generated from relevant interactions.",
    "Our services and the providers you connect to receive network information such as your IP address, requested URLs, and browser or device information when handling requests. atradio Connect also uses a device identifier, device name, connection presence, and playback state to coordinate your connected players.",
  ] },
  { id: "public-data", title: "Public activity on AT Protocol", paragraphs: [
    "AT Protocol is a public, decentralized network. Records you publish for atradio.fm, including favorites, registered stations, comments, reactions, listening status, and synchronized audio settings, are stored in your account's repository on your Personal Data Server (PDS). They can be accessed and indexed by other people and services.",
    "atradio.fm indexes public records to display profiles, station information, community activity, and listener counts. Public activity may also appear in community integrations. Signing in and playing a station can publish your listening activity; listen while signed out if you do not want playback associated with your AT Protocol identity.",
  ] },
  { id: "authentication", title: "Authentication and local storage", paragraphs: [
    "Sign-in and Bluesky account creation are handled by your identity provider through OAuth. Enter your password only on the provider's authentication page. atradio.fm uses the authorization you grant to access your account and publish supported records; it does not require you to give your password to atradio.fm.",
    "The website and app store session credentials and preferences on your browser or device to keep you signed in and remember settings. This includes playback preferences, equalizer settings, cached content, and, on the web, a device identifier and a randomly generated KLIPY identifier. You can remove local data through your browser or device settings. Removing local data does not delete public records or server-side history.",
  ] },
  { id: "providers", title: "Services that receive information", paragraphs: [
    "Your AT Protocol provider and Bluesky services handle authentication, handle lookup, profile retrieval, and public repository data. Your account provider's own privacy policy also applies.",
    "Radio Browser, TuneIn-related services, station broadcasters, and our streaming proxy handle station discovery and audio delivery. Search providers receive the search terms you submit. Broadcasters and media hosts receive connection information when your device connects directly to their streams or artwork. A station may include its own advertising or tracking in its broadcast or delivery service.",
    "When you use the GIF picker, KLIPY receives your search terms, network request information, and a customer identifier used for media discovery. Loading a selected GIF or other externally hosted media also contacts its host. Hosting and infrastructure providers process requests needed to deliver atradio.fm.",
  ] },
  { id: "retention", title: "Retention and deletion", paragraphs: [
    "Local preferences and cached content remain until cleared or replaced. Session credentials remain until removed, expired, or revoked. Signing out stops authenticated use on that device but does not delete your AT Protocol account or previously published activity.",
    "Public records remain in your PDS until you delete them or your provider removes them. atradio.fm processes supported record-deletion events to remove indexed favorites, stations, comments, and reactions. Deleting your current listening-status record does not automatically erase historical plays already indexed by atradio.fm.",
    "To request deletion of data held by atradio.fm, use the contact details below and identify your handle or DID and the data concerned. We may need to verify that the account belongs to you. Do not send your password or access tokens. For deletion of your underlying Bluesky or other AT Protocol account, use your account provider's account-deletion process.",
    "Other services may retain copies of public data they have already received. atradio.fm cannot remove copies controlled by independent services. Request deletion from those services separately when needed.",
  ] },
  { id: "security", title: "Security and your choices", paragraphs: [
    "atradio.fm uses HTTPS for its application APIs and OAuth for account authorization. Radio streams are supplied by independent broadcasters, and some source streams use unencrypted HTTP. Avoid including private or sensitive information in public comments, station descriptions, or other repository records.",
    "You can use radio discovery and playback without signing in, revoke atradio.fm's authorization through your account provider, remove supported content, and clear local app or browser storage. Contact us with requests to access, correct, or delete information held by atradio.fm, or with questions about your privacy rights.",
  ] },
];

export function PrivacyPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Privacy Policy · atradio.fm";
    return () => { document.title = previous; };
  }, []);
  return (
    <article lang="en" className="mx-auto max-w-3xl pb-8">
      <header className="border-b border-white/10 pb-8">
        <p className="mb-3 text-sm font-medium text-synth-cyan">atradio.fm</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-sm text-foreground/60">Last updated: October 5, 2026</p>
        <p className="mt-6 leading-relaxed text-foreground/80">This policy explains how atradio.fm handles information when you use our website, Android app (fm.atradio.app), and related radio services.</p>
      </header>
      <nav aria-label="Privacy policy sections" className="my-8 flex flex-wrap gap-x-5 gap-y-3 text-sm">
        {sections.map((section) => <a key={section.id} href={`#${section.id}`} className="text-synth-cyan underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{section.title}</a>)}
        <a href="#contact" className="text-synth-cyan underline-offset-4 hover:underline">Contact</a>
      </nav>
      <div className="space-y-9">
        {sections.map((section) => <section key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="mb-3 font-display text-xl font-semibold">{section.title}</h2>
          <div className="space-y-3 leading-7 text-foreground/80">{section.paragraphs.map((text) => <p key={text}>{text}</p>)}</div>
        </section>)}
        <section id="contact" className="scroll-mt-24 rounded-2xl border border-white/10 bg-synth-surface p-6">
          <h2 className="mb-3 font-display text-xl font-semibold">Contact and privacy requests</h2>
          <p className="leading-7 text-foreground/80">For privacy questions or data-deletion requests, email <a href="mailto:hi@rocksky.app" className="text-synth-cyan underline underline-offset-4">hi@rocksky.app</a>. Include your handle or DID and describe your request. Never send passwords or access tokens.</p>
        </section>
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold">Changes to this policy</h2>
          <p className="leading-7 text-foreground/80">We may update this policy as the service changes. The date above identifies the latest version.</p>
        </section>
      </div>
    </article>
  );
}
