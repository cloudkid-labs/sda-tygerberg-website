/** Copy for the members area Settings tab (admins only, C-71). */
type SettingsCopy = {
  heading: string;
  intro: string;
  fromConfig: string;
  savedBy: string;
  adminsHeading: string;
  adminsNote: string;
  adminEverything: string;
  membersHeading: string;
  membersNote: string;
  colMember: string;
  noAddresses: string;
  remove: string;
  addMember: string;
  addMemberLabel: string;
  routesHeading: string;
  routesNote: string;
  routeAddress: string;
  routeTo: string;
  addRoute: string;
  everythingElse: string;
  archiveCopy: string;
  notifyHeading: string;
  notifyNote: string;
  destinationsNote: string;
  save: string;
  saving: string;
  saved: string;
  errLoad: string;
  errConflict: string;
  errInvalid: string;
  errSave: string;
  errForbidden: string;
  headshotNoPhoto: string;
  notHod: string;
  noDestinations: string;
  superAdmin: string;
  adminToggle: string;
  adminEveryRole: string;
  tabPeople: string;
  tabEmail: string;
  sendAsHeading: string;
  sendAsNote: string;
  hodLabel: string;
  hodChoose: string;
  nameLabel: string;
  photoLabel: string;
  photoOptional: string;
  photoUpload: string;
  photoUploading: string;
  photoRemove: string;
  photoError: string;
  destHeading: string;
  destNote: string;
  destPending: string;
  destRoutesOnly: string;
  destRoutesAndNotify: string;
  destAddLabel: string;
  destAdd: string;
  destAdding: string;
  destAdded: string;
  destRemaining: string;
  destRefresh: string;
  destEmpty: string;
  destDeployNote: string;
  destErrInvalid: string;
  destErrExists: string;
  destErrLimit: string;
  destErrUpstream: string;
  destErrLoad: string;
  fieldErrors: Record<string, string>;
};

export const settingsCopy: Record<'af' | 'en', SettingsCopy> = {
  af: {
    heading: 'Instellings',
    intro:
      'Wie by die lede-area kan aanmeld, as watter kerkadresse elkeen mag stuur (en dus wie se Kerkraadpos hulle sien), waarheen pos aan elke adres gaan, en wie van webwerf-navrae hoor. Veranderinge geld dadelik.',
    fromConfig: 'Nog nie hier gestoor nie — dit is die waardes uit die ontplooiing.',
    savedBy: 'Laas gestoor deur {by}, {when}.',
    adminsHeading: 'SuperAdmins',
    adminsNote: 'SuperAdmins kan alles doen en geen administrateur kan hulle herroep nie. Hulle word in die ontplooiing gestel. Net hulle gebruik die argief- en hul eie adresse.',
    adminEverything: 'Alle adresse',
    membersHeading: 'Kerkraadlede',
    membersNote: 'Elke lid meld met Google aan. Koppel hulle aan hul departementshoof-inskrywing (naam en foto), of merk die blokkie as hulle nie ’n departementshoof is nie.',
    colMember: 'Lid',
    noAddresses: 'Geen pos nie — net webwerf-inhoud.',
    remove: 'Verwyder',
    addMember: 'Voeg lid by',
    addMemberLabel: 'Nuwe lid se Google-e-posadres',
    routesHeading: 'Inkomende pos',
    routesNote: 'Pos aan ’n adres hier gaan na sy bestemming in plaas van die algemene posbus. Enige geverifieerde bestemming kan gekies word.',
    routeAddress: 'Kerkadres',
    routeTo: 'Stuur aan na',
    addRoute: 'Voeg roete by',
    everythingElse: 'Alle ander adresse → {to}',
    archiveCopy: '’n Afskrif van alle pos → {to}',
    notifyHeading: 'Webwerf-navrae',
    notifyNote: 'Wie ’n kennisgewing kry wanneer iemand die webwerf se vorms invul.',
    destinationsNote:
      'Net bestemmings in die ontplooiing kan kennisgewings kry. ’n Nuwe een word onder Bestemmingsadresse bygevoeg en het dan ook ’n ontplooiing nodig.',
    save: 'Stoor instellings',
    saving: 'Stoor…',
    saved: 'Gestoor. Dit geld nou.',
    errLoad: 'Kon nie die instellings laai nie.',
    errConflict: 'Iemand anders het intussen gestoor. Die nuutste is gelaai — maak jou veranderinge weer.',
    errInvalid: 'Kyk na die gemerkte velde.',
    errSave: 'Kon nie stoor nie. Probeer weer.',
    errForbidden: 'Net administrateurs kan instellings sien.',
    headshotNoPhoto: 'nog geen foto',
    notHod: 'Kerkraadlid sonder ’n departementshoof-pos',
    noDestinations:
      'Hierdie werf het geen pos-instellings nie (op die toetswerf is pos af), so stuur-as-adresse, roetes en kennisgewings kan nie hier gestel word nie. Stel dit op die regte werf.',
    superAdmin: 'SuperAdmin — kan nie herroep word nie',
    adminToggle: 'Administrateur (kan alles doen, insluitend Instellings)',
    adminEveryRole: 'Administrateur — alle rol-adresse',
    tabPeople: 'Kerkraadlede',
    tabEmail: 'E-posinstellings',
    sendAsHeading: 'Wie stuur as wat',
    sendAsNote: 'Merk die adresse waarvan elke lid mag stuur; hulle sien net pos van daardie adresse.',
    hodLabel: 'Departementshoof (naam en foto)',
    hodChoose: '— Kies die persoon —',
    nameLabel: 'Naam',
    photoLabel: 'Profielfoto',
    photoOptional: 'nie verpligtend nie',
    photoUpload: 'Laai foto op',
    photoUploading: 'Laai op…',
    photoRemove: 'Verwyder foto',
    photoError: 'Kon nie die foto oplaai nie (JPG of PNG, tot 5 MB).',
    destHeading: 'Bestemmingsadresse',
    destNote: 'Waarheen Cloudflare kerkpos mag aflewer. As jy een byvoeg, e-pos Cloudflare daardie adres ’n bevestigingskakel; dit kan gebruik word sodra die eienaar daarop klik.',
    destPending: 'Wag vir bevestiging',
    destRoutesOnly: 'Geverifieer — net inkomende roetes',
    destRoutesAndNotify: 'Geverifieer — roetes en kennisgewings',
    destAddLabel: 'Nuwe bestemmingsadres',
    destAdd: 'Voeg bestemming by',
    destAdding: 'Voeg by…',
    destAdded: 'Bygevoeg. Cloudflare het ’n bevestigingskakel aan {email} gestuur.',
    destRemaining: 'Nog {n} kan vandag bygevoeg word.',
    destRefresh: 'Kyk weer',
    destEmpty: 'Nog geen bestemmingsadresse nie.',
    destDeployNote: 'Om ’n geverifieerde adres vir webwerf-navrae te gebruik, voeg dit by MAIL_DESTINATIONS en allowed_destination_addresses in die ontplooiing.',
    destErrInvalid: 'Nie ’n geldige adres nie, of een wat nie hier bestuur kan word nie (kerkadresse ook nie).',
    destErrExists: 'Daardie adres is reeds ’n bestemming.',
    destErrLimit: 'Die daaglikse perk is bereik. Probeer môre weer.',
    destErrUpstream: 'Cloudflare het nie geantwoord nie. Probeer weer.',
    destErrLoad: 'Kon nie die bestemmingsadresse laai nie.',
    fieldErrors: {
      email: 'Nie ’n geldige adres nie, ’n duplikaat, of ’n administrateur.',
      sendAs: 'Een van die adresse is nie meer beskikbaar nie.',
      address: 'Moet ’n kerkadres wees (nie die argief nie), een keer.',
      to: 'Kies ’n geverifieerde bestemming.',
      notify: 'Kies ten minste een geverifieerde bestemming (nie die argief nie).',
      profile: 'Kies ’n departementshoof, of merk die blokkie en tik ’n naam.',
    },
  },
  en: {
    heading: 'Settings',
    intro:
      'Who can sign in to the members area, which church addresses each may send as (and so whose Board mail they see), where mail to each address goes, and who hears of website enquiries. Changes apply at once.',
    fromConfig: 'Not saved here yet — these are the values from the deployment.',
    savedBy: 'Last saved by {by}, {when}.',
    adminsHeading: 'SuperAdmins',
    adminsNote: 'SuperAdmins can do everything and no admin can revoke them. They are set in the deployment. Only they use the archive and their own addresses.',
    adminEverything: 'Every address',
    membersHeading: 'Board members',
    membersNote: 'Each member signs in with Google. Link them to their department-head entry (name and photo), or tick the box if they are not a department head.',
    colMember: 'Member',
    noAddresses: 'No mail — website content only.',
    remove: 'Remove',
    addMember: 'Add member',
    addMemberLabel: 'New member’s Google email address',
    routesHeading: 'Incoming mail',
    routesNote: 'Mail to an address listed here goes to its destination instead of the general inbox. Any verified destination can be chosen.',
    routeAddress: 'Church address',
    routeTo: 'Forward to',
    addRoute: 'Add route',
    everythingElse: 'Every other address → {to}',
    archiveCopy: 'A copy of all mail → {to}',
    notifyHeading: 'Website enquiries',
    notifyNote: 'Who is notified when someone fills in one of the website’s forms.',
    destinationsNote:
      'Only destinations in the deployment can be notified. A new one is added under Destination addresses and then also needs a deploy.',
    save: 'Save settings',
    saving: 'Saving…',
    saved: 'Saved. It applies now.',
    errLoad: 'Could not load the settings.',
    errConflict: 'Someone else saved in the meantime. The latest is loaded — make your changes again.',
    errInvalid: 'Check the marked fields.',
    errSave: 'Could not save. Try again.',
    errForbidden: 'Only admins can see settings.',
    headshotNoPhoto: 'no photo yet',
    notHod: 'Board member without a department-head position',
    noDestinations:
      'This site has no mail configuration (mail is off on the test site), so send-as addresses, routes and notifications cannot be set here. Set them on the live site.',
    superAdmin: 'SuperAdmin — cannot be revoked',
    adminToggle: 'Admin (can do everything, including Settings)',
    adminEveryRole: 'Admin — every role address',
    tabPeople: 'Board members',
    tabEmail: 'Email settings',
    sendAsHeading: 'Who sends as what',
    sendAsNote: 'Tick the addresses each member may send as; they see only mail for those addresses.',
    hodLabel: 'Department head (name and photo)',
    hodChoose: '— Choose the person —',
    nameLabel: 'Name',
    photoLabel: 'Profile picture',
    photoOptional: 'not required',
    photoUpload: 'Upload photo',
    photoUploading: 'Uploading…',
    photoRemove: 'Remove photo',
    photoError: 'Could not upload the photo (JPG or PNG, up to 5 MB).',
    destHeading: 'Destination addresses',
    destNote: 'Where Cloudflare may deliver church mail. Adding one makes Cloudflare email that address a confirmation link; it can be used once the owner clicks it.',
    destPending: 'Waiting for confirmation',
    destRoutesOnly: 'Verified — inbound routes only',
    destRoutesAndNotify: 'Verified — routes and notifications',
    destAddLabel: 'New destination address',
    destAdd: 'Add destination',
    destAdding: 'Adding…',
    destAdded: 'Added. Cloudflare has emailed {email} a confirmation link.',
    destRemaining: '{n} more can be added today.',
    destRefresh: 'Check again',
    destEmpty: 'No destination addresses yet.',
    destDeployNote: 'To use a verified address for website enquiries, add it to MAIL_DESTINATIONS and allowed_destination_addresses in the deployment.',
    destErrInvalid: 'Not a valid address, or one that cannot be managed here (church addresses neither).',
    destErrExists: 'That address is already a destination.',
    destErrLimit: 'The daily limit is reached. Try again tomorrow.',
    destErrUpstream: 'Cloudflare did not answer. Try again.',
    destErrLoad: 'Could not load the destination addresses.',
    fieldErrors: {
      email: 'Not a valid address, a duplicate, or an admin.',
      sendAs: 'One of the addresses is no longer available.',
      address: 'Must be a church address (not the archive), once.',
      to: 'Choose a verified destination.',
      notify: 'Choose at least one verified destination (not the archive).',
      profile: 'Choose a department head, or tick the box and type a name.',
    },
  },
};
