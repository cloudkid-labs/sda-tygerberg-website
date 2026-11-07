import type { Lang } from './site';
import { beliefThemes } from './beliefThemes';

export type BeliefItem = {
  af: { title: string; desc: string };
  en: { title: string; desc: string };
};

export type BeliefCategory = {
  name: Record<Lang, string>;
  desc: Record<Lang, string>;
  items: BeliefItem[];
};


/**
 * The 28 beliefs, in theme order. Six groups, one per entry in `beliefThemes` —
 * the names and summaries live there so the homepage summary can read them
 * without pulling all 28 descriptions into its bundle. C-57
 */
const BELIEF_ITEMS: BeliefItem[][] = [
  [
  {
    af: {
      title: 'Die Heilige Skrif',
      desc: 'Die Bybel is God se geïnspireerde, betroubare Woord, gegee deur uitverkore skrywers deur die Heilige Gees. Dit is die maatstaf waaraan alle leerstellings en ervaring getoets moet word. Dit openbaar God se wil vir verlossing en vir die daaglikse lewe.',
    },
    en: {
      title: 'Holy Scriptures',
      desc: 'The Old and New Testaments are the inspired, trustworthy Word of God, given through chosen writers by the Holy Spirit. Scripture is the standard by which all teaching and experience must be tested. It reveals God’s will for salvation and for daily living.',
    },
  },
  {
    af: {
      title: 'Die Drie-eenheid',
      desc: 'Daar is een God — Vader, Seun en Heilige Gees — ’n eenheid van drie ewige Persone. God is oneindig, persoonlik en waardig om aanbid te word. Elke Persoon deel ten volle in die werk van skepping, verlossing en daaglikse gemeenskap met sy volk.',
    },
    en: {
      title: 'The Trinity',
      desc: 'There is one God — Father, Son and Holy Spirit — a unity of three co-eternal Persons. God is infinite, personal, and worthy of all worship. Each Person shares fully in the work of creation, redemption and daily communion with His people.',
    },
  },
  {
    af: {
      title: 'Die Vader',
      desc: 'God die Vader is die Skepper, Bron, Onderhouer en Soewerein van die hele skepping. Hy is regverdig en heilig, genadig en liefdevol, lankmoedig en oorvloedig in liefde. Alles wat die Seun en die Gees oor God openbaar, vloei uit die Vader se eie karakter.',
    },
    en: {
      title: 'The Father',
      desc: 'God the Father is the Creator, Source, Sustainer and Sovereign of all creation. He is just and holy, merciful and gracious, slow to anger and abounding in love. Everything the Son and Spirit reveal about God flows from the Father’s own character.',
    },
  },
  {
    af: {
      title: 'Die Seun',
      desc: 'In Jesus Christus het God mens geword sonder om op te hou God te wees, en het ’n sondelose lewe gelei en in ons plek aan die kruis gesterf. Hy het liggaamlik uit die graf opgestaan en opgevaar om namens ons te bedien. Hy sal persoonlik en sigbaar terugkeer om sy verlossingswerk te voltooi.',
    },
    en: {
      title: 'The Son',
      desc: 'In Jesus Christ, God became human without ceasing to be divine, living a sinless life and dying in our place on the cross. He rose bodily from the grave and ascended to minister on our behalf. He will return personally and visibly to complete His work of salvation.',
    },
  },
  {
    af: {
      title: 'Die Heilige Gees',
      desc: 'Die Heilige Gees was werksaam in die skepping, die vleeswording en die skryf van die Skrif. Hy oortuig die wêreld van sonde en trek mense na Christus toe. Hy woon in gelowiges en bekragtig hulle dag vir dag, en bring die vrug van die Gees in hul lewens voort.',
    },
    en: {
      title: 'The Holy Spirit',
      desc: 'The Holy Spirit was active in creation, the incarnation, and the writing of Scripture. He convicts the world of sin and draws people to Christ. He lives in and empowers believers day by day, producing the fruit of the Spirit in their lives.',
    },
  },
  {
    af: {
      title: 'Die Skepping',
      desc: 'God is die Skepper van alle dinge, geopenbaar in die Skrif as ’n onlangse, letterlike skepping in ses dae wat ons ‘goeie’ wêreld gevorm het en rus gebring het op die sewende dag. Hierdie Bybelse verslag is die grondslag vir ons geloof in ’n persoonlike, magtige God. Dit is ook die basis vir die Sabbat as ’n blywende gedenkteken van die skepping.',
    },
    en: {
      title: 'Creation',
      desc: 'God is Creator of all things, revealed in Scripture as a recent, literal, six-day creation that formed our ‘good’ world and gave rest on the seventh day. This biblical account stands as the basis for our belief in a personal, powerful God. It also grounds the Sabbath as a perpetual memorial of creation.',
    },
  },
  ],
  [
  {
    af: {
      title: 'Die Aard van die Mens',
      desc: 'Man en vrou is na die beeld van God geskape, met waardigheid, vryheid en die vermoë tot verhouding met hul Skepper. Deur sonde is daardie beeld verwring en die mensdom is nou onderhewig aan swakheid en sterflikheid. Tog behou elke mens inherente waarde en word herstel deur Christus aangebied.',
    },
    en: {
      title: 'Nature of Humanity',
      desc: 'Man and woman were made in the image of God, with dignity, freedom and the capacity for relationship with their Creator. Through sin, that image has been distorted and humanity is now subject to weakness and mortality. Yet every person retains inherent worth and is offered restoration through Christ.',
    },
  },
  {
    af: {
      title: 'Die Groot Stryd',
      desc: 'Die hele mensdom is nou betrokke by ’n groot stryd tussen Christus en Satan oor die karakter van God, sy wet, en sy heerskappy oor die heelal. Hierdie stryd het in die hemel begin en gaan voort op aarde, en raak elke mens se lewe. Gelowiges word geroep om God se kant te kies en vryheid van die bose se greep te vind.',
    },
    en: {
      title: 'The Great Controversy',
      desc: 'All humanity is now involved in a great controversy between Christ and Satan regarding the character of God, His law, and His sovereignty over the universe. This conflict began in heaven and continues on earth, touching every human life. Believers are called to take God’s side and find freedom from evil’s grip.',
    },
  },
  ],
  [
  {
    af: {
      title: 'Die Lewe, Dood en Opstanding van Christus',
      desc: 'Christus het ’n volmaakte lewe van gehoorsaamheid gelei en aan die kruis gesterf as die eens-en-vir-altyd offer vir ons sonde. Sy liggaamlike opstanding is die waarborg dat almal wat op Hom vertrou, ook opgewek sal word. Deur Hom alleen kan ons met God versoen word.',
    },
    en: {
      title: 'Life, Death and Resurrection of Christ',
      desc: 'Christ lived a perfect life of obedience and died on the cross as the once-for-all sacrifice for our sin. His bodily resurrection is the guarantee that all who trust in Him will likewise be raised. Through Him alone we can be reconciled to God.',
    },
  },
  {
    af: {
      title: 'Die Ervaring van Verlossing',
      desc: 'In oneindige liefde het God sy Seun gegee sodat ons in Hom deur genade, deur geloof, gered kan word — nie deur ons eie werke nie. Christus se geregtigheid word aan ons toegereken die oomblik wat ons Hom aanneem, wat ons staat voor God verseker. Van daardie oomblik af begin die Gees ’n lewenslange werk van verandering in ons.',
    },
    en: {
      title: 'The Experience of Salvation',
      desc: 'In infinite love God gave His Son so that in Him we might be saved by grace through faith, not by our own works. Christ’s righteousness is credited to us the moment we accept Him, assuring our standing before God. From that moment the Spirit begins a lifelong work of transformation in us.',
    },
  },
  {
    af: {
      title: 'Groei in Christus',
      desc: 'Deur sy dood aan die kruis het Christus getriomfeer oor die magte van die bose wat gelowiges vandag nog aanval. Soos ons daagliks aan sy heerskappy onderwerp, bevry Hy ons van die gewoontes en gedagtes wat ons eens beheer het. Deur die Gees en die studie van die Skrif groei ons gestaag om al hoe meer soos Hy te word.',
    },
    en: {
      title: 'Growing in Christ',
      desc: 'By His death on the cross, Christ triumphed over the powers of evil that still assail believers today. As we submit daily to His lordship, He frees us from the habits and thoughts that once controlled us. Through the Spirit and the study of Scripture, we grow steadily into His likeness.',
    },
  },
  ],
  [
  {
    af: {
      title: 'Die Kerk',
      desc: 'Die kerk is die gemeenskap van gelowiges wat Jesus Christus as Here en Verlosser bely, en saamkom vir aanbidding, gemeenskap en onderrig in die Woord. Dit is God se familie, die liggaam van Christus, uit die wêreld geroep tot gemeenskap met Hom en met mekaar. Sy sending is om die evangelie aan alle mense te verkondig.',
    },
    en: {
      title: 'The Church',
      desc: 'The church is the community of believers who confess Jesus Christ as Lord and Saviour, gathered for worship, fellowship and instruction in the Word. It is God’s family, the body of Christ, called out of the world into fellowship with Him and one another. Its mission is to proclaim the gospel to all people.',
    },
  },
  {
    af: {
      title: 'Die Oorblyfsel en Sy Sending',
      desc: 'In die laaste dae roep God ’n oorblyfselvolk uit wat sy gebooie hou en die geloof van Jesus vashou. Hierdie eindtydse beweging verkondig die ewige evangelie, die oordeelsuur, en die naderende wederkoms van Christus aan ’n wagtende wêreld. Dit bestaan om mense van elke nasie voor te berei vir sy koms.',
    },
    en: {
      title: 'The Remnant and Its Mission',
      desc: 'In the last days, God calls out a remnant people who keep His commandments and hold the faith of Jesus. This end-time movement proclaims the everlasting gospel, the judgment hour, and the imminent return of Christ to a waiting world. It exists to prepare people, of every nation, for His coming.',
    },
  },
  {
    af: {
      title: 'Eenheid in die Liggaam van Christus',
      desc: 'Die kerk is een liggaam met baie lede, geroep uit elke nasie, ras, kultuur en taal. In Christus word ons ’n nuwe skepping, en onderskeid van ras, klas, nasionaliteit, geslag en status verdeel ons nie meer nie. Saam dien ons een Here, deel ons een geloof, en weerspieël ons God se ryke diversiteit in eenheid.',
    },
    en: {
      title: 'Unity in the Body of Christ',
      desc: 'The church is one body with many members, called from every nation, race, culture and language. In Christ we become a new creation, and distinctions of race, class, nationality, gender and status no longer divide us. Together we serve one Lord, share one faith, and reflect God’s rich diversity in unity.',
    },
  },
  {
    af: {
      title: 'Die Doop',
      desc: 'Deur die doop bely ons ons geloof in die dood en opstanding van Jesus Christus, en getuig ons van ons dood vir sonde en ons voorneme om in nuwigheid van lewe te wandel. Na onderrig in die Skrif word gelowiges deur volle onderdompeling gedoop. Dit merk ’n publieke intrede tot kerklidmaatskap en Christelike gemeenskap.',
    },
    en: {
      title: 'Baptism',
      desc: 'By baptism we confess our faith in the death and resurrection of Jesus Christ, and testify of our death to sin and our intention to walk in newness of life. Following instruction in Scripture, believers are baptised by full immersion. It marks a public entry into church membership and Christian fellowship.',
    },
  },
  {
    af: {
      title: 'Die Nagmaal',
      desc: 'Die Nagmaal is ’n deelname aan die simbole van Christus se liggaam en bloed, wat ons geloof in Hom as Verlosser en Here uitdruk. Dit word voorafgegaan deur die voetwassing, ’n herinnering aan nederige diens. Alle gelowiges word uitgenooi om aan hierdie maaltyd deel te neem totdat Christus terugkom.',
    },
    en: {
      title: 'The Lord’s Supper',
      desc: 'The Lord’s Supper is a participation in the emblems of Christ’s body and blood, expressing our faith in Him as Saviour and Lord. It is preceded by the ordinance of foot-washing, a reminder of humble service. All believers are invited to share in this meal until Christ returns.',
    },
  },
  {
    af: {
      title: 'Geestelike Gawes en Bedieninge',
      desc: 'God gee elke lid van die kerk geestelike gawes deur die Heilige Gees, om in liefdevolle bediening tot algemene voordeel gebruik te word. Hierdie gawes rus die kerk toe vir sy werk, bou gelowiges op in eenheid en volwassenheid, en stimuleer groei en uitreik. Elke gelowige het ’n rol om in die liggaam te speel.',
    },
    en: {
      title: 'Spiritual Gifts and Ministries',
      desc: 'God gives every member of the church spiritual gifts through the Holy Spirit, to be used in loving ministry for the common good. These gifts equip the church for its work, build up believers in unity and maturity, and stimulate growth and outreach. Every believer has a role to play in the body.',
    },
  },
  {
    af: {
      title: 'Die Gawe van Profesie',
      desc: 'Die Skrif getuig dat profesie een van die gawes van die Heilige Gees is, en identifiseer die bediening van Ellen G. White as ’n manifestasie van hierdie gawe binne die Adventistebeweging. Haar geskrifte praat met gesag en bied troos, leiding, onderrig en teregwysing. Hulle word beskou as ’n voortgesette bron van waarheid, altyd onderworpe aan die Skrif.',
    },
    en: {
      title: 'The Gift of Prophecy',
      desc: 'The Scriptures testify that prophecy is one of the gifts of the Holy Spirit, identifying the ministry of Ellen G. White as a manifestation of this gift within the Adventist movement. Her writings speak with authority and provide comfort, guidance, instruction and correction. They are held as a continuing and authoritative source of truth, subject always to Scripture.',
    },
  },
  ],
  [
  {
    af: {
      title: 'Die Wet van God',
      desc: 'Die groot beginsels van God se wet word beliggaam in die Tien Gebooie en voorgehou in die lewe van Christus. Dit druk God se liefde, wil en bedoeling vir menslike gedrag en verhoudings uit. Deur Christus se genade word ons in staat gestel om hierdie wet te hou — nie om verlossing te verdien nie, maar as bewys daarvan.',
    },
    en: {
      title: 'The Law of God',
      desc: 'The great principles of God’s law are embodied in the Ten Commandments and exemplified in the life of Christ. They express God’s love, will and purposes for human conduct and relationships. Through Christ’s grace we are enabled to keep this law, not to earn salvation but as evidence of it.',
    },
  },
  {
    af: {
      title: 'Die Sabbat',
      desc: 'Die sewendedag-Sabbat is deur God by die skepping ingestel as ’n gedenkteken van sy voltooide werk, en bly die teken van sy verbond met sy volk. Dit is ’n dag van vreugdevolle rus, aanbidding en gemeenskap, vry van gewone arbeid en sorge. Om dit weekliks te onderhou, vernuwe ons verhouding met God en met mekaar.',
    },
    en: {
      title: 'The Sabbath',
      desc: 'The seventh-day Sabbath was instituted by God at creation as a memorial of His completed work, and remains the sign of His covenant with His people. It is a day of joyful rest, worship and fellowship, freed from ordinary labour and concerns. Observing it weekly renews our relationship with God and one another.',
    },
  },
  {
    af: {
      title: 'Rentmeesterskap',
      desc: 'Ons is rentmeesters aan wie God tyd, vermoëns, besittings en die seëninge van die aarde toevertrou het. Ons erken sy eienaarskap deur getroue diens en deur tiendes terug te gee en offergawes te bring vir die ondersteuning en verspreiding van die evangelie. Rentmeesterskap is ’n uitdrukking van dankbaarheid en vertroue, nie ’n verpligting nie.',
    },
    en: {
      title: 'Stewardship',
      desc: 'We are stewards entrusted by God with time, abilities, possessions and the blessings of the earth. We acknowledge His ownership through faithful service and by returning tithe and giving offerings for the support and spread of the gospel. Stewardship is an expression of gratitude and trust, not obligation.',
    },
  },
  {
    af: {
      title: 'Christelike Lewenswandel',
      desc: 'Ons word geroep tot ’n lewenstyl wat die skoonheid en eenvoud van die evangelie in kleredrag, spraak, ontspanning en verhoudings weerspieël. Dit sluit in om na die liggaam om te sien as die tempel van die Heilige Gees deur gesonde voeding, oefening en rus. Gelowiges vermy stowwe en vermaak wat hierdie tempel kan skaad of geestelike sensitiwiteit kan verdoof.',
    },
    en: {
      title: 'Christian Behavior',
      desc: 'We are called to a lifestyle that reflects the beauty and simplicity of the gospel in dress, speech, recreation and relationships. This includes caring for the body as the temple of the Holy Spirit through wholesome nutrition, exercise and rest. Believers avoid substances and entertainment that would harm this temple or dull spiritual sensitivity.',
    },
  },
  {
    af: {
      title: 'Huwelik en Gesin',
      desc: 'Die huwelik is goddelik ingestel in Eden as ’n lewenslange verbintenis tussen een man en een vrou, in liefdevolle metgeselskap. Christen-ouers word geroep om hul kinders in die liefde en onderrig van die Here groot te maak, en ’n stabiele, versorgende huis te bou. Die gesinskring behoort die aarde se naaste weerspieëling van God se liefde te wees.',
    },
    en: {
      title: 'Marriage and the Family',
      desc: 'Marriage was divinely instituted in Eden as a lifelong union between one man and one woman, in loving companionship. Christian parents are called to raise their children in the love and instruction of the Lord, building a stable, nurturing home. The family circle is meant to be earth’s closest reflection of God’s love.',
    },
  },
  ],
  [
  {
    af: {
      title: 'Christus se Bediening in die Hemelse Heiligdom',
      desc: 'Daar is ’n hemelse heiligdom, die ware tabernakel wat die Here opgerig het, waarin Christus namens ons bedien. Sedert 1844 is Hy besig met ’n finale fase van sy bediening, ’n ondersoekende oordeel wat openbaar wie, deur geloof in Hom, gereed is vir sy koninkryk. Hierdie werk verseker gelowiges van ’n regverdige oordeel en volkome verlossing.',
    },
    en: {
      title: 'Christ’s Ministry in the Heavenly Sanctuary',
      desc: 'There is a heavenly sanctuary, the true tabernacle which the Lord set up, in which Christ ministers on our behalf. Since 1844 He has been engaged in a final phase of His ministry, an investigative judgment that reveals who, through faith in Him, are ready for His kingdom. This work assures believers of certain judgment and complete salvation.',
    },
  },
  {
    af: {
      title: 'Die Wederkoms van Christus',
      desc: 'Die wederkoms van Christus is die geseënde hoop van die kerk, die hoogtepunt van die evangelie. Dit sal persoonlik, sigbaar en wêreldwyd wees, vergesel van die opstanding van die regverdige dode. Omdat die tyd daarvan onbekend is, word gelowiges geroep om te alle tye gereed te wees.',
    },
    en: {
      title: 'The Second Coming of Christ',
      desc: 'The second coming of Christ is the blessed hope of the church, the climax of the gospel. It will be personal, visible and worldwide, accompanied by the resurrection of the righteous dead. Because its time is unknown, believers are called to be ready at all times.',
    },
  },
  {
    af: {
      title: 'Dood en Opstanding',
      desc: 'Die loon van sonde is die dood, maar die dood is ’n toestand van onbewuste rus, nie ’n onmiddellike oorgang na hemel of hel nie. By Christus se wederkoms word die regverdige dode onverganklik opgewek en, saam met die lewende regverdiges, verheerlik en na Hom geneem om by Hom te wees. Die goddelose bly in hul grafte tot ’n latere opstanding.',
    },
    en: {
      title: 'Death and Resurrection',
      desc: 'The wages of sin is death, but death is a state of unconscious rest, not an immediate transition to heaven or hell. At Christ’s return the righteous dead are raised imperishable and, together with the living righteous, are glorified and taken to be with Him. The wicked remain in their graves until a later resurrection.',
    },
  },
  {
    af: {
      title: 'Die Duisendjarige Ryk en die Einde van Sonde',
      desc: 'Die duisendjarige ryk is ’n duisendjarige heerskappy van Christus en sy heiliges in die hemel tussen die eerste en tweede opstanding, waartydens die goddelose dode geoordeel word. Aan die einde daal Christus en sy volk af, word die goddelose opgewek vir finale oordeel, en word sonde en sondaars deur vuur verteer. Dit reinig die heelal vir ewig van sonde.',
    },
    en: {
      title: 'The Millennium and the End of Sin',
      desc: 'The millennium is a thousand-year reign of Christ and His saints in heaven between the first and second resurrections, during which the wicked dead are judged. At its close Christ and His people descend, the wicked are raised for final judgment, and sin and sinners are consumed by fire. This purifies the universe of sin forever.',
    },
  },
  {
    af: {
      title: 'Die Nuwe Aarde',
      desc: 'Op die nuwe aarde, waar geregtigheid woon, sal God ’n ewige tuiste vir die verlostes voorsien en ’n volmaakte omgewing vir ewige lewe. Daar sal geen dood, hartseer of pyn meer wees nie, en God Homself sal vir ewig onder sy volk woon. Dit is die uiteindelike oplossing van die groot stryd tussen goed en kwaad.',
    },
    en: {
      title: 'The New Earth',
      desc: 'On the new earth, where righteousness dwells, God will provide an eternal home for the redeemed and a perfect environment for everlasting life. There will be no more death, sorrow or pain, and God Himself will dwell among His people forever. This is the ultimate resolution of the great controversy between good and evil.',
    },
  },
  ],
];

export const beliefCategories: BeliefCategory[] = beliefThemes.map((theme, i) => ({
  ...theme,
  items: BELIEF_ITEMS[i],
}));
