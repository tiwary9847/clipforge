// Animated travel map: a styled map (Natural Earth outlines, no internet needed) with the route drawing itself,
// a vehicle riding along it and each stop popping in.
import GEO from './geo.json'
import { Clip } from './types'
import { getPreset, getState } from './store'

export type MapStyle = 'street' | 'clean' | 'dark' | 'satellite' | 'simple'
export type TravelMode = 'car' | 'train' | 'plane' | 'bike' | 'walk' | 'bus'
export interface Stop {
  n: string
  lat: number
  lon: number
}
export interface MapData {
  stops: Stop[]
  mode: TravelMode
  theme: MapStyle | 'light' | 'paper'
  title?: string
}

export const MODES: { id: TravelMode; icon: string; name: string }[] = [
  { id: 'car', icon: '🚗', name: 'Car' },
  { id: 'bike', icon: '🏍️', name: 'Bike' },
  { id: 'bus', icon: '🚌', name: 'Bus' },
  { id: 'train', icon: '🚆', name: 'Train' },
  { id: 'plane', icon: '✈️', name: 'Plane' },
  { id: 'walk', icon: '🚶', name: 'Walk' },
]

// name, lat, lon – NCR first, then cities, then trip spots, then abroad
const P = `Noida,28.535,77.391;Greater Noida,28.474,77.504;Ghaziabad,28.669,77.454;Delhi,28.614,77.209;New Delhi,28.614,77.209;Gurugram,28.459,77.026;Faridabad,28.408,77.317;Meerut,28.984,77.706;
Mumbai,19.076,72.878;Pune,18.52,73.857;Bengaluru,12.972,77.595;Bangalore,12.972,77.595;Hyderabad,17.385,78.487;Chennai,13.083,80.271;Kolkata,22.573,88.364;Ahmedabad,23.023,72.571;Surat,21.17,72.831;Jaipur,26.912,75.787;Lucknow,26.847,80.946;Kanpur,26.449,80.332;Nagpur,21.146,79.088;Indore,22.72,75.858;Bhopal,23.26,77.413;Patna,25.594,85.138;Vadodara,22.307,73.181;Ludhiana,30.901,75.857;Agra,27.177,78.008;Nashik,19.998,73.79;Rajkot,22.304,70.802;Varanasi,25.318,82.974;Prayagraj,25.435,81.846;Allahabad,25.435,81.846;Srinagar,34.084,74.797;Amritsar,31.634,74.872;Ranchi,23.344,85.31;Coimbatore,11.017,76.956;Jodhpur,26.238,73.024;Madurai,9.925,78.12;Raipur,21.251,81.63;Kota,25.214,75.865;Chandigarh,30.733,76.779;Guwahati,26.144,91.736;Mysuru,12.296,76.639;Mysore,12.296,76.639;Bhubaneswar,20.296,85.825;Thiruvananthapuram,8.524,76.937;Kochi,9.931,76.267;Dehradun,30.317,78.032;Jammu,32.727,74.857;Visakhapatnam,17.687,83.218;Vijayawada,16.506,80.648;Gwalior,26.218,78.183;Jabalpur,23.181,79.987;Aligarh,27.898,78.088;Bareilly,28.367,79.43;Moradabad,28.839,78.773;Gorakhpur,26.76,83.373;Mathura,27.492,77.673;Vrindavan,27.58,77.7;Ayodhya,26.792,82.199;Haridwar,29.946,78.164;Rishikesh,30.087,78.268;Mussoorie,30.459,78.066;Nainital,29.38,79.464;Shimla,31.105,77.173;Manali,32.24,77.189;Kasol,32.01,77.315;Dharamshala,32.219,76.323;McLeod Ganj,32.242,76.321;Dalhousie,32.537,75.971;Leh,34.152,77.577;Ladakh,34.152,77.577;Gulmarg,34.048,74.38;Pahalgam,34.016,75.315;Katra,32.991,74.932;Vaishno Devi,33.03,74.949;Kedarnath,30.735,79.067;Badrinath,30.744,79.493;Auli,30.529,79.57;
Udaipur,24.585,73.712;Jaisalmer,26.915,70.908;Pushkar,26.49,74.551;Ajmer,26.449,74.639;Mount Abu,24.593,72.708;Ranthambore,26.017,76.502;Bikaner,28.022,73.312;Khajuraho,24.832,79.919;Ujjain,23.179,75.785;Omkareshwar,22.245,76.151;Orchha,25.351,78.64;Goa,15.299,74.124;Panaji,15.491,73.828;Lonavala,18.752,73.406;Mahabaleshwar,17.925,73.657;Shirdi,19.766,74.477;Aurangabad,19.876,75.343;Ajanta,20.552,75.703;Ellora,20.026,75.179;Dwarka,22.24,68.968;Somnath,20.888,70.401;Statue of Unity,21.838,73.719;Rann of Kutch,23.734,69.86;
Ooty,11.41,76.695;Kodaikanal,10.238,77.489;Munnar,10.089,77.06;Alleppey,9.498,76.339;Alappuzha,9.498,76.339;Wayanad,11.685,76.132;Varkala,8.733,76.716;Kovalam,8.4,76.979;Kanyakumari,8.088,77.539;Rameswaram,9.288,79.313;Pondicherry,11.934,79.83;Puducherry,11.934,79.83;Mahabalipuram,12.62,80.199;Tirupati,13.629,79.419;Hampi,15.335,76.46;Coorg,12.338,75.806;Gokarna,14.55,74.318;Chikmagalur,13.316,75.772;
Darjeeling,27.036,88.263;Gangtok,27.339,88.607;Shillong,25.578,91.893;Cherrapunji,25.284,91.721;Kaziranga,26.578,93.171;Tawang,27.586,91.859;Puri,19.813,85.831;Konark,19.888,86.095;Bodh Gaya,24.696,84.991;Port Blair,11.623,92.726;Andaman,11.623,92.726;Havelock Island,11.967,93.0;Lakshadweep,10.567,72.642;Spiti,32.246,78.035;Kasauli,30.9,76.965;Jim Corbett,29.53,78.774;Lansdowne,29.84,78.68;Neemrana,27.988,76.386;
Kathmandu,27.717,85.324;Pokhara,28.21,83.986;Thimphu,27.472,89.639;Paro,27.43,89.413;Colombo,6.927,79.861;Dhaka,23.81,90.412;Male,4.175,73.509;Maldives,3.203,73.221;Dubai,25.205,55.271;Abu Dhabi,24.454,54.377;Doha,25.285,51.531;Bangkok,13.756,100.502;Phuket,7.88,98.392;Pattaya,12.936,100.882;Singapore,1.352,103.82;Kuala Lumpur,3.139,101.687;Bali,-8.409,115.189;Hong Kong,22.32,114.169;Tokyo,35.676,139.65;Istanbul,41.008,28.978;London,51.507,-0.128;Paris,48.857,2.352;New York,40.713,-74.006;Toronto,43.653,-79.383;Sydney,-33.869,151.209;Melbourne,-37.814,144.963;Los Angeles,34.052,-118.244;San Francisco,37.775,-122.419;Vietnam,16.047,108.206;Hanoi,21.028,105.854;Baku,40.41,49.867;Almaty,43.222,76.851;Moscow,55.756,37.617;Zurich,47.377,8.541;
Muzaffarpur,26.12,85.39;Darbhanga,26.152,85.897;Gaya,24.796,85.0;Bhagalpur,25.244,86.972;Purnia,25.778,87.475;Begusarai,25.418,86.13;Samastipur,25.863,85.781;Motihari,26.647,84.916;Bettiah,26.802,84.503;Sitamarhi,26.595,85.48;Madhubani,26.353,86.072;Hajipur,25.686,85.21;Chapra,25.78,84.73;Siwan,26.22,84.36;Gopalganj,26.468,84.438;Arrah,25.556,84.663;Buxar,25.564,83.978;Sasaram,24.95,84.03;Aurangabad (Bihar),24.752,84.374;Nalanda,25.136,85.443;Rajgir,25.029,85.42;Bihar Sharif,25.197,85.523;Munger,25.375,86.473;Saharsa,25.88,86.6;Katihar,25.54,87.58;Kishanganj,26.1,87.95;Araria,26.15,87.52;Supaul,26.12,86.6;Jehanabad,25.21,84.99;Nawada,24.88,85.54;Vaishali,25.99,85.13;Raxaul,26.98,84.85;Jamshedpur,22.805,86.203;Dhanbad,23.795,86.43;Bokaro,23.669,86.151;Hazaribagh,23.992,85.361;Deoghar,24.483,86.695;Giridih,24.19,86.3;Noida Extension,28.597,77.432;Hapur,28.73,77.776;Bulandshahr,28.407,77.85;Muzaffarnagar,29.473,77.708;Saharanpur,29.968,77.546;Roorkee,29.866,77.891;Shamli,29.45,77.31;Baghpat,28.94,77.22;Firozabad,27.151,78.396;Etawah,26.776,79.023;Mainpuri,27.235,79.025;Jhansi,25.448,78.569;Lalitpur,24.69,78.41;Banda,25.48,80.33;Rae Bareli,26.23,81.23;Sultanpur,26.26,82.07;Pratapgarh,25.9,81.94;Jaunpur,25.75,82.69;Azamgarh,26.07,83.18;Mau,25.94,83.56;Ballia,25.76,84.15;Ghazipur,25.58,83.58;Mirzapur,25.15,82.57;Sonbhadra,24.69,83.07;Basti,26.8,82.73;Gonda,27.13,81.96;Bahraich,27.57,81.6;Sitapur,27.57,80.68;Hardoi,27.4,80.13;Lakhimpur Kheri,27.95,80.78;Shahjahanpur,27.88,79.91;Pilibhit,28.63,79.8;Rampur,28.81,79.03;Badaun,28.03,79.13;Sambhal,28.58,78.57;Amroha,28.9,78.47;Unnao,26.55,80.49;Fatehpur,25.93,80.81;Kushinagar,26.74,83.89;Deoria,26.5,83.78;Faizabad,26.77,82.14;Barabanki,26.94,81.18;Rewari,28.198,76.619;Rohtak,28.895,76.607;Sonipat,28.993,77.016;Panipat,29.391,76.97;Karnal,29.686,76.99;Kurukshetra,29.97,76.85;Ambala,30.378,76.776;Yamunanagar,30.13,77.27;Hisar,29.149,75.722;Bhiwani,28.79,76.13;Sirsa,29.53,75.03;Jind,29.32,76.31;Palwal,28.14,77.33;Manesar,28.36,76.94;Panchkula,30.69,76.86;Mohali,30.704,76.718;Zirakpur,30.64,76.82;Jalandhar,31.326,75.576;Patiala,30.34,76.386;Bathinda,30.211,74.945;Pathankot,32.274,75.652;Hoshiarpur,31.53,75.91;Moga,30.82,75.17;Firozpur,30.92,74.6;Anandpur Sahib,31.24,76.5;Solan,30.905,77.097;Mandi,31.708,76.932;Kullu,31.958,77.109;Bilaspur (HP),31.34,76.76;Hamirpur (HP),31.68,76.52;Kangra,32.1,76.27;Chamba,32.55,76.13;Kinnaur,31.6,78.4;Kaza,32.226,78.072;Kalpa,31.54,78.26;Bir Billing,32.05,76.72;Tosh,32.02,77.45;Jibhi,31.59,77.36;Chitkul,31.35,78.44;Rohtang Pass,32.37,77.25;Sissu,32.48,77.13;Haldwani,29.219,79.513;Rudrapur,28.98,79.4;Kashipur,29.21,78.96;Almora,29.597,79.659;Ranikhet,29.643,79.432;Pithoragarh,29.58,80.22;Bageshwar,29.84,79.77;Kausani,29.84,79.6;Mukteshwar,29.47,79.65;Bhimtal,29.35,79.56;Chopta,30.48,79.2;Tungnath,30.49,79.22;Joshimath,30.555,79.565;Uttarkashi,30.727,78.435;Gangotri,30.994,78.94;Yamunotri,31.014,78.46;Kedarkantha,31.02,78.17;Chakrata,30.7,77.87;Dhanaulti,30.43,78.24;Tehri,30.38,78.43;Srinagar (Uttarakhand),30.22,78.78;Pauri,30.15,78.78;Alwar,27.553,76.635;Bharatpur,27.217,77.49;Sikar,27.61,75.14;Jhunjhunu,28.13,75.4;Churu,28.3,74.95;Nagaur,27.2,73.73;Pali,25.77,73.32;Barmer,25.75,71.39;Bhilwara,25.35,74.63;Chittorgarh,24.879,74.629;Kumbhalgarh,25.15,73.59;Bundi,25.44,75.64;Sawai Madhopur,26.02,76.35;Tonk,26.17,75.79;Dausa,26.89,76.34;Sri Ganganagar,29.92,73.88;Hanumangarh,29.58,74.32;Banswara,23.55,74.44;Dungarpur,23.84,73.71;Mandawa,28.06,75.15;Khatu Shyam,27.36,75.4;Salasar,27.72,74.72;Sagar,23.838,78.738;Rewa,24.53,81.3;Satna,24.6,80.83;Katni,23.83,80.39;Chhindwara,22.06,78.94;Pachmarhi,22.47,78.43;Burhanpur,21.31,76.23;Khandwa,21.82,76.35;Dewas,22.97,76.05;Ratlam,23.33,75.04;Mandu,22.34,75.4;Maheshwar,22.18,75.59;Sanchi,23.48,77.74;Bandhavgarh,23.7,81.03;Kanha,22.28,80.61;Amarkantak,22.67,81.75;Chitrakoot,25.2,80.9;Shivpuri,25.42,77.66;Guna,24.65,77.31;Vidisha,23.52,77.81;Morena,26.5,78.0;Datia,25.67,78.46;Bilaspur,22.08,82.15;Durg,21.19,81.28;Bhilai,21.21,81.38;Korba,22.35,82.68;Jagdalpur,19.08,82.03;Ambikapur,23.12,83.2;Solapur,17.659,75.906;Kolhapur,16.705,74.243;Sangli,16.85,74.58;Satara,17.69,74.0;Ahmednagar,19.09,74.74;Jalgaon,21.0,75.56;Akola,20.7,77.0;Amravati,20.93,77.75;Latur,18.4,76.57;Nanded,19.15,77.3;Thane,19.218,72.978;Navi Mumbai,19.033,73.03;Kalyan,19.24,73.13;Vasai,19.39,72.84;Alibaug,18.64,72.87;Ratnagiri,16.99,73.3;Malvan,16.06,73.47;Tarkarli,16.03,73.48;Matheran,18.99,73.27;Igatpuri,19.7,73.56;Pandharpur,17.68,75.33;Trimbakeshwar,19.93,73.53;Kolad,18.42,73.3;Ganpatipule,17.15,73.27;Lavasa,18.4,73.5;Gandhinagar,23.216,72.637;Bhavnagar,21.765,72.152;Jamnagar,22.47,70.06;Junagadh,21.52,70.46;Anand,22.56,72.95;Bharuch,21.71,72.98;Navsari,20.95,72.92;Vapi,20.37,72.9;Bhuj,23.25,69.67;Gir,21.17,70.6;Saputara,20.58,73.75;Diu,20.71,70.98;Daman,20.42,72.83;Silvassa,20.27,73.01;Modhera,23.58,72.13;Ambaji,24.33,72.85;Palitana,21.52,71.83;Hubli,15.364,75.124;Dharwad,15.46,75.01;Belagavi,15.85,74.5;Mangaluru,12.914,74.856;Mangalore,12.914,74.856;Udupi,13.34,74.75;Shivamogga,13.93,75.57;Davanagere,14.46,75.92;Ballari,15.14,76.92;Kalaburagi,17.33,76.83;Bidar,17.91,77.52;Tumakuru,13.34,77.1;Hassan,13.0,76.1;Badami,15.92,75.68;Murudeshwar,14.09,74.48;Dandeli,15.25,74.62;Sakleshpur,12.94,75.79;Kabini,11.9,76.35;Nandi Hills,13.37,77.68;Bandipur,11.67,76.63;Warangal,17.968,79.594;Karimnagar,18.44,79.13;Nizamabad,18.67,78.09;Khammam,17.25,80.15;Guntur,16.3,80.44;Nellore,14.44,79.99;Kurnool,15.83,78.04;Kadapa,14.47,78.82;Anantapur,14.68,77.6;Rajahmundry,17.0,81.8;Kakinada,16.99,82.25;Srisailam,16.07,78.87;Araku Valley,18.33,82.87;Amaravati,16.57,80.36;Srikakulam,18.3,83.9;Vizianagaram,18.11,83.4;Salem,11.664,78.146;Tiruchirappalli,10.79,78.705;Trichy,10.79,78.705;Tirunelveli,8.713,77.756;Vellore,12.916,79.132;Erode,11.34,77.72;Tiruppur,11.11,77.34;Thanjavur,10.787,79.137;Kanchipuram,12.83,79.7;Chidambaram,11.4,79.69;Nagapattinam,10.77,79.84;Velankanni,10.68,79.85;Yercaud,11.78,78.21;Valparai,10.33,76.95;Hosur,12.74,77.83;Dhanushkodi,9.18,79.42;Kozhikode,11.259,75.78;Calicut,11.259,75.78;Thrissur,10.527,76.214;Kannur,11.87,75.37;Kollam,8.89,76.61;Kottayam,9.59,76.52;Palakkad,10.78,76.65;Thekkady,9.6,77.16;Vagamon,9.69,76.9;Kumarakom,9.6,76.43;Bekal,12.39,75.03;Guruvayur,10.59,76.04;Sabarimala,9.43,77.08;Cuttack,20.462,85.883;Rourkela,22.26,84.85;Sambalpur,21.47,83.97;Berhampur,19.31,84.79;Chilika,19.72,85.32;Balasore,21.49,86.93;Siliguri,26.727,88.395;Asansol,23.68,86.98;Durgapur,23.52,87.31;Howrah,22.59,88.31;Digha,21.63,87.51;Shantiniketan,23.68,87.68;Kalimpong,27.06,88.47;Mirik,26.89,88.18;Sundarbans,21.95,88.88;Murshidabad,24.18,88.27;Malda,25.0,88.14;Haldia,22.06,88.07;Bardhaman,23.23,87.86;Dibrugarh,27.47,94.91;Jorhat,26.75,94.2;Silchar,24.83,92.78;Tezpur,26.63,92.8;Majuli,26.95,94.17;Agartala,23.83,91.28;Imphal,24.817,93.937;Aizawl,23.727,92.718;Kohima,25.67,94.11;Dimapur,25.9,93.73;Itanagar,27.08,93.61;Ziro,27.59,93.84;Dawki,25.18,92.02;Mawlynnong,25.2,91.92;Lachung,27.69,88.75;Pelling,27.3,88.24;Namchi,27.17,88.36;Nathula,27.39,88.83;Gurudongmar,28.02,88.71;Anantnag,33.73,75.15;Sonamarg,34.3,75.29;Kargil,34.55,76.13;Nubra Valley,34.6,77.6;Pangong Lake,33.75,78.66;Patnitop,33.08,75.33;Udhampur,32.93,75.14;Doda,33.15,75.55;Bhaderwah,32.98,75.71;Panjim,15.491,73.828;Calangute,15.54,73.76;Baga,15.56,73.75;Anjuna,15.58,73.74;Palolem,15.01,74.02;Margao,15.27,73.96;Vasco da Gama,15.4,73.81;Lumbini,27.48,83.28;Chitwan,27.53,84.35;Janakpur,26.73,85.92;Birgunj,27.01,84.88;Biratnagar,26.45,87.27;Nagarkot,27.72,85.52;Lahore,31.55,74.34;Karachi,24.86,67.0;Chittagong,22.34,91.83;Cox's Bazar,21.43,92.0;Kandy,7.29,80.63;Galle,6.03,80.22;Muscat,23.59,58.41;Riyadh,24.71,46.68;Jeddah,21.49,39.19;Mecca,21.42,39.83;Medina,24.47,39.61;Sharjah,25.35,55.42;Kuwait City,29.38,47.99;Bahrain,26.23,50.59;Krabi,8.09,98.91;Chiang Mai,18.79,98.98;Ho Chi Minh City,10.82,106.63;Da Nang,16.05,108.2;Phu Quoc,10.23,103.97;Langkawi,6.35,99.8;Penang,5.41,100.33;Jakarta,-6.21,106.85;Manila,14.6,120.98;Seoul,37.57,126.98;Beijing,39.9,116.41;Shanghai,31.23,121.47;Kyoto,35.01,135.77;Osaka,34.69,135.5;Tbilisi,41.72,44.78;Yerevan,40.18,44.51;Cairo,30.04,31.24;Nairobi,-1.29,36.82;Mauritius,-20.35,57.55;Seychelles,-4.68,55.49;Rome,41.9,12.5;Venice,45.44,12.32;Barcelona,41.39,2.17;Amsterdam,52.37,4.9;Berlin,52.52,13.4;Prague,50.08,14.44;Vienna,48.21,16.37;Interlaken,46.69,7.86;Lucerne,47.05,8.31;Edinburgh,55.95,-3.19;Dublin,53.35,-6.26;Chicago,41.88,-87.63;Vancouver,49.28,-123.12;Auckland,-36.85,174.76`

export const PLACES: Stop[] = P.split(';')
  .map((x) => x.trim())
  .filter(Boolean)
  .map((x) => {
    const [n, lat, lon] = x.split(',')
    return { n, lat: +lat, lon: +lon }
  })

/** Places found online earlier – remembered so they work offline next time. */
const SAVED_KEY = 'clipforge-places'
function saved(): Stop[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
  } catch {
    return []
  }
}
export function rememberPlace(p: Stop) {
  try {
    const list = [p, ...saved().filter((x) => x.n.toLowerCase() !== p.n.toLowerCase())].slice(0, 200)
    localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  } catch {}
}
const all = () => [...saved(), ...PLACES]

export interface Found extends Stop {
  sub?: string // state / country, to tell same-named places apart
}

/** Looks a place up on OpenStreetMap (any town or village in the world). Needs internet. */
export async function searchOnline(q: string): Promise<Found[]> {
  const s = q.trim()
  if (s.length < 2) return []
  const out: Found[] = []
  const add = (n: string, lat: number, lon: number, sub: string) => {
    if (!n || !isFinite(lat) || !isFinite(lon)) return
    if (out.some((o) => o.n === n && Math.abs(o.lat - lat) < 0.05 && Math.abs(o.lon - lon) < 0.05)) return
    out.push({ n, lat: +lat.toFixed(4), lon: +lon.toFixed(4), sub })
  }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=en&q=${encodeURIComponent(s)}`, { headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(String(r.status))
    for (const x of (await r.json()) as any[]) {
      const a = x.address ?? {}
      add(x.name || String(x.display_name ?? '').split(',')[0], +x.lat, +x.lon, [a.state || a.county, a.country].filter(Boolean).join(', '))
    }
  } catch {
    // second free service if the first is busy
    const r = await fetch(`https://photon.komoot.io/api/?limit=6&lang=en&q=${encodeURIComponent(s)}`)
    if (!r.ok) throw new Error('offline')
    const j = await r.json()
    for (const f of j.features ?? []) {
      const pr = f.properties ?? {}
      const [lon, lat] = f.geometry?.coordinates ?? []
      add(pr.name, +lat, +lon, [pr.state, pr.country].filter(Boolean).join(', '))
    }
  }
  return out
}

/** Finds a place by name, or reads "Name, 28.5, 77.3" / "28.5, 77.3". */
export function findPlace(q: string): Stop | null {
  const s = q.trim()
  if (!s) return null
  const m = s.match(/^(.*?)[,\s]+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/) || s.match(/^()(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (m) return { n: m[1].trim() || `${(+m[2]).toFixed(2)}, ${(+m[3]).toFixed(2)}`, lat: +m[2], lon: +m[3] }
  const low = s.toLowerCase()
  const L = all()
  return L.find((p) => p.n.toLowerCase() === low) ?? L.find((p) => p.n.toLowerCase().replace(/ \(.*\)$/, '') === low) ?? null
}

export function suggest(q: string, n = 6): Stop[] {
  const low = q.trim().toLowerCase()
  if (!low) return []
  const seen = new Set<string>()
  const L = all()
  return [...L.filter((p) => p.n.toLowerCase().startsWith(low)), ...L.filter((p) => p.n.toLowerCase().includes(low))]
    .filter((p) => !seen.has(p.n) && seen.add(p.n))
    .slice(0, n)
}

export function km(a: Stop, b: Stop) {
  const R = 6371
  const r = Math.PI / 180
  const dl = (b.lat - a.lat) * r
  const dn = (b.lon - a.lon) * r
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}


/* ================= real map tiles ================= */

interface TileStyle {
  url: string // {z}/{x}/{y}
  labels?: string // optional overlay (place names on satellite)
  px: number // tile image size (512 = retina)
  max: number
  credit: string
  route: string
  dark: boolean
}
export const MAP_STYLES: { id: MapStyle; name: string; icon: string }[] = [
  { id: 'street', name: 'Street', icon: '🗺' },
  { id: 'clean', name: 'Clean', icon: '🧭' },
  { id: 'satellite', name: 'Satellite', icon: '🛰' },
  { id: 'dark', name: 'Dark', icon: '🌙' },
  { id: 'simple', name: 'Simple (offline)', icon: '📜' },
]
const TILES: Record<string, TileStyle> = {
  street: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', px: 256, max: 18, credit: '© OpenStreetMap contributors', route: '#e8173c', dark: false },
  clean: { url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png', px: 512, max: 18, credit: '© OpenStreetMap contributors © CARTO', route: '#e8173c', dark: false },
  dark: { url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', px: 512, max: 18, credit: '© OpenStreetMap contributors © CARTO', route: '#ffd400', dark: true },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    px: 256,
    max: 17,
    credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
    route: '#ffd400',
    dark: true,
  },
}
export const styleOf = (m: MapData): MapStyle => {
  const st = m.theme === 'light' ? 'street' : m.theme === 'paper' ? 'simple' : m.theme
  return st === 'street' && osmFails >= 2 ? 'clean' : st
}

// tile cache: url → image (loaded), or a pending promise
const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<void>>()
const failed = new Set<string>()
let onTile = () => {}
let osmFails = 0 // OpenStreetMap refuses some pages (e.g. a file opened from disk) – then Street uses the Clean map
export const setTileReady = (f: () => void) => (onTile = f)

function load(url: string): Promise<void> {
  if (cache.has(url) || failed.has(url)) return Promise.resolve()
  let p = pending.get(url)
  if (p) return p
  p = new Promise<void>((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous' // keeps the canvas exportable
    im.onload = () => {
      cache.set(url, im)
      if (cache.size > 600) cache.delete(cache.keys().next().value!)
      pending.delete(url)
      onTile()
      res()
    }
    im.onerror = () => {
      failed.add(url)
      if (url.includes('tile.openstreetmap.org') && ++osmFails >= 2) onTile()
      pending.delete(url)
      res()
    }
    im.src = url
  })
  pending.set(url, p)
  return p
}
const tileUrl = (t: string, z: number, x: number, y: number) => t.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))

// Web-Mercator, in "zoom 0" pixels (the whole world = 256)
const MX = (lon: number) => ((lon + 180) / 360) * 256
const MY = (lat: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 256
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2)

/** The visible map area of a map clip at local time lt: centre + width, in zoom-0 pixels. */
function viewAt(m: MapData, lt: number) {
  const xs = m.stops.map((s) => MX(s.lon))
  const ys = m.stops.map((s) => MY(s.lat))
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const minSpan = (1.2 / 360) * 256 // about 130 km across, so a short trip still shows its surroundings
  const span = Math.max(minSpan, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.6
  const intro = ease(Math.min(1, lt / 0.9))
  return { cx, cy, view: span * (2.2 - 1.2 * intro) }
}

/** Map zoom level that keeps map labels a readable size on the final video. */
function zoomFor(c: Clip, st: TileStyle, view: number) {
  const out = (c.stickerSize ?? 0.2) * getPreset().h * 3.2 * Math.abs(c.scale || 1) // card size in output pixels
  const s = out / view // output px per zoom-0 px
  const z = Math.round(Math.log2((256 * s) / (st.px * 1.15)))
  return Math.max(2, Math.min(st.max, z))
}

function tilesFor(cx: number, cy: number, view: number, z: number) {
  const n = 2 ** z
  const k = n / 256 // tiles per zoom-0 px
  const x0 = Math.floor((cx - view / 2) * k)
  const x1 = Math.floor((cx + view / 2) * k)
  const y0 = Math.max(0, Math.floor((cy - view / 2) * k))
  const y1 = Math.min(n - 1, Math.floor((cy + view / 2) * k))
  const out: [number, number][] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y])
  return out
}

/** Downloads every map picture a map clip needs (all zoom steps of its animation). Used before export. */
export async function prepareMaps(timeoutMs = 15000) {
  const jobs: Promise<void>[] = []
  for (const c of getState().project.clips) {
    if (c.shape !== 'map' || !c.map?.stops.length) continue
    const st = TILES[styleOf(c.map)]
    if (!st) continue
    for (let lt = 0; lt <= 1.0; lt += 0.1) {
      const v = viewAt(c.map, lt)
      const z = zoomFor(c, st, v.view)
      for (const [x, y] of tilesFor(v.cx, v.cy, v.view, z)) {
        const n = 2 ** z
        const xx = ((x % n) + n) % n
        jobs.push(load(tileUrl(st.url, z, xx, y)))
        if (st.labels) jobs.push(load(tileUrl(st.labels, z, xx, y)))
      }
    }
  }
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))])
}

/** Draws one tile layer; missing tiles are filled from a lower zoom (blurry for a moment) and requested. */
function drawTiles(ctx: CanvasRenderingContext2D, tpl: string, z: number, cx: number, cy: number, view: number, s: number) {
  const n = 2 ** z
  const tw = (256 / n) * s // tile size on the canvas
  let missing = 0
  for (const [x, y] of tilesFor(cx, cy, view, z)) {
    const xx = ((x % n) + n) % n
    const dx = ((x * 256) / n - cx) * s
    const dy = ((y * 256) / n - cy) * s
    const im = cache.get(tileUrl(tpl, z, xx, y))
    if (im) {
      ctx.drawImage(im, dx, dy, tw + 0.6, tw + 0.6)
      continue
    }
    missing++
    void load(tileUrl(tpl, z, xx, y))
    // stand-in from a parent tile
    for (let up = 1; up <= 4 && z - up >= 0; up++) {
      const pz = z - up
      const f = 2 ** up
      const px = Math.floor(xx / f)
      const py = Math.floor(y / f)
      const p = cache.get(tileUrl(tpl, pz, px, py))
      if (!p) continue
      const sub = p.naturalWidth / f
      ctx.drawImage(p, (xx % f) * sub, (y % f) * sub, sub, sub, dx, dy, tw + 0.6, tw + 0.6)
      break
    }
  }
  return missing
}

const SIMPLE = { sea: '#cfe8f5', land: '#f6f1e6', border: '#c9bfa8', route: '#ff3b5c', text: '#1d1d1f', pill: '#ffffff' }

/** Draws the map card centred at the origin, box = S*3.2 square. */
export function drawMap(ctx: CanvasRenderingContext2D, c: Clip, lt: number, S: number) {
  const m = c.map
  const size = S * 3.2
  const half = size / 2
  const style = m ? styleOf(m) : 'simple'
  const tile = TILES[style]
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-half, -half, size, size, size * 0.05)
  ctx.fillStyle = tile ? (tile.dark ? '#1b2330' : '#e9e5dc') : SIMPLE.sea
  ctx.fill()
  ctx.clip()
  if (!m || !m.stops.length) {
    ctx.restore()
    return
  }
  const st = m.stops
  const { cx, cy, view } = viewAt(m, lt)
  const s = size / view
  const X = (lon: number) => (MX(lon) - cx) * s
  const Y = (lat: number) => (MY(lat) - cy) * s
  ctx.lineJoin = 'round'
  // ---- background: the simple outline map is always drawn first, so any map picture that hasn't
  // downloaded (or can't, when offline) shows a clean map instead of a hole
  ctx.fillStyle = SIMPLE.sea
  ctx.fillRect(-half, -half, size, size)
  const polys = [...(GEO as any).world, ...(GEO as any).southAsia] as [string, number[]][]
  for (const [, f] of polys) {
    let any = false
    ctx.beginPath()
    for (let i = 0; i < f.length; i += 2) {
      const x = X(f[i])
      const y = Y(f[i + 1])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      if (!any && x > -size * 2 && x < size * 2 && y > -size * 2 && y < size * 2) any = true
    }
    if (!any) continue
    ctx.closePath()
    ctx.fillStyle = SIMPLE.land
    ctx.fill()
    ctx.strokeStyle = SIMPLE.border
    ctx.lineWidth = Math.max(1, size * 0.003)
    ctx.stroke()
  }
  let shown = 0
  if (tile) {
    const z = zoomFor(c, tile, view)
    ctx.imageSmoothingQuality = 'high'
    const list = tilesFor(cx, cy, view, z)
    const miss = drawTiles(ctx, tile.url, z, cx, cy, view, s)
    if (tile.labels) drawTiles(ctx, tile.labels, z, cx, cy, view, s)
    shown = list.length - miss
  }
  const offline = !tile || shown === 0
  const routeCol = tile && !offline ? tile.route : SIMPLE.route
  // ---- route geometry (planes fly an arc)
  const pts: [number, number][] = []
  for (let i = 0; i < st.length - 1; i++) {
    const a: [number, number] = [X(st[i].lon), Y(st[i].lat)]
    const b: [number, number] = [X(st[i + 1].lon), Y(st[i + 1].lat)]
    const N = 48
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const bend = m.mode === 'plane' ? 0.22 : 0.03
    const nx = -(b[1] - a[1]) / (d || 1)
    const ny = (b[0] - a[0]) / (d || 1)
    for (let j = i === 0 ? 0 : 1; j <= N; j++) {
      const u = j / N
      const h = Math.sin(u * Math.PI) * d * bend
      pts.push([a[0] + (b[0] - a[0]) * u + nx * h, a[1] + (b[1] - a[1]) * u + ny * h])
    }
  }
  if (st.length === 1) pts.push([X(st[0].lon), Y(st[0].lat)])
  const dur = Math.max(1.5, c.dur - 1.6)
  const P = ease(Math.min(1, Math.max(0, (lt - 0.9) / dur)))
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = lens[lens.length - 1] || 1
  const upto = P * total
  const path = (to: number) => {
    ctx.beginPath()
    let head: [number, number] = pts[0]
    let dir = 0
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) {
      if (lens[i] <= to) {
        ctx.lineTo(pts[i][0], pts[i][1])
        head = pts[i]
        dir = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
      } else {
        const f = (to - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1])
        head = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]
        dir = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
        ctx.lineTo(head[0], head[1])
        break
      }
    }
    return { head, dir }
  }
  ctx.lineCap = 'round'
  // planned route, faint and dashed
  ctx.setLineDash([size * 0.014, size * 0.012])
  ctx.strokeStyle = tile && !offline ? (tile.dark ? 'rgba(255,255,255,0.55)' : 'rgba(30,30,40,0.45)') : routeCol + '66'
  ctx.lineWidth = size * 0.007
  path(total)
  ctx.stroke()
  ctx.setLineDash([])
  // travelled part: white casing + colour, like a navigation app
  path(upto)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = size * 0.022
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = size * 0.012
  ctx.stroke()
  ctx.shadowColor = 'transparent'
  const { head, dir } = path(upto)
  ctx.strokeStyle = routeCol
  ctx.lineWidth = size * 0.013
  ctx.stroke()
  const titleText = m.title || (st.length > 1 ? `${st[0].n} → ${st[st.length - 1].n}` : st[0].n)
  ctx.font = `800 ${size * 0.055}px Inter, system-ui, sans-serif`
  const titleW = ctx.measureText(titleText).width
  // ---- stops: map pins that drop in when the route reaches them
  const segLen = total / Math.max(1, st.length - 1)
  const intro = ease(Math.min(1, lt / 0.9))
  st.forEach((p, i) => {
    const reachedAt = st.length === 1 ? 0 : segLen * i
    if (i > 0 && upto < reachedAt - 1e-6) return
    const tReach = i === 0 ? 0.6 : 0.9 + dur * (i / Math.max(1, st.length - 1)) * 0.98
    const pop = i === 0 ? intro : Math.min(1, Math.max(0, (lt - Math.min(tReach, lt)) / 0.3 + (upto >= reachedAt ? 0.4 : 0)))
    const x = X(p.lon)
    const y = Y(p.lat)
    const last = i === st.length - 1 && st.length > 1
    const r = size * 0.026 * (0.5 + 0.5 * Math.min(1, pop))
    // pin
    ctx.save()
    ctx.translate(x, y)
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = size * 0.012
    ctx.shadowOffsetY = size * 0.004
    ctx.fillStyle = i === 0 ? '#16a34a' : last ? '#dc2626' : '#2563eb'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-r * 0.4, -r * 0.9, -r * 1.05, -r * 1.25, -r * 1.05, -r * 1.95)
    ctx.arc(0, -r * 1.95, r * 1.05, Math.PI, 0)
    ctx.bezierCurveTo(r * 1.05, -r * 1.25, r * 0.4, -r * 0.9, 0, 0)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(0, -r * 1.95, r * 0.42, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // label
    const fs = size * 0.042
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`
    const tw = ctx.measureText(p.n).width
    const lx = Math.max(-half + tw / 2 + fs * 0.6, Math.min(half - tw / 2 - fs * 0.6, x))
    let ly = y - r * 3.3 - fs * 0.5
    // would hit the title card in the top-left? put the name under the pin instead
    const tfs = size * 0.055
    const titleBottom = -half + tfs * 0.5 + tfs * (st.length > 1 ? 2.25 : 1.5) + fs * 0.3
    const titleRight = -half + tfs * 0.5 + Math.min(size * 0.86, titleW) + tfs * 0.9 + fs * 0.3
    if (ly - fs * 0.72 < titleBottom && lx - tw / 2 - fs * 0.5 < titleRight) ly = y + fs * 1.1
    if (ly - fs * 0.72 < -half + fs * 0.2) ly = y + fs * 1.1
    ctx.globalAlpha = Math.min(1, Math.max(0, pop))
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = size * 0.01
    ctx.beginPath()
    ctx.roundRect(lx - tw / 2 - fs * 0.5, ly - fs * 0.72, tw + fs, fs * 1.44, fs * 0.72)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#111827'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.n, lx, ly + fs * 0.04)
    ctx.globalAlpha = 1
  })
  // ---- vehicle riding at the head of the line
  if (st.length > 1 && lt > 0.9) {
    const icon = MODES.find((x) => x.id === m.mode)?.icon ?? '🚗'
    const fs = size * 0.085
    ctx.save()
    ctx.translate(head[0], head[1])
    // a white disc behind the vehicle so it stands out on any map
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = size * 0.015
    ctx.beginPath()
    ctx.arc(0, 0, fs * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    if (m.mode === 'plane') ctx.rotate(dir + Math.PI / 4)
    else if (Math.cos(dir) > 0 && m.mode !== 'train' && m.mode !== 'walk') ctx.scale(-1, 1) // side-view vehicles face left
    ctx.font = `${fs * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(icon, 0, fs * 0.04)
    ctx.restore()
  }
  // ---- title card + distance
  const dist = st.slice(1).reduce((a, p, i) => a + km(st[i], p), 0)
  const title = m.title || (st.length > 1 ? `${st[0].n} → ${st[st.length - 1].n}` : st[0].n)
  const fs = size * 0.055
  ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`
  const tw = Math.min(size * 0.86, ctx.measureText(title).width)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = size * 0.015
  ctx.beginPath()
  ctx.roundRect(-half + fs * 0.5, -half + fs * 0.5, tw + fs * 0.9, fs * (st.length > 1 ? 2.25 : 1.5), fs * 0.4)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#111827'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(title, -half + fs * 0.95, -half + fs * 0.75, size * 0.86)
  if (st.length > 1) {
    ctx.font = `600 ${fs * 0.55}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#4b5563'
    ctx.fillText(`${MODES.find((x) => x.id === m.mode)?.icon ?? ''}  ≈ ${Math.round(dist * P).toLocaleString('en-IN')} km straight line`, -half + fs * 0.95, -half + fs * 1.75)
  }
  // ---- map credit (required by the map providers)
  if (tile && !offline) {
    const cs = size * 0.022
    ctx.font = `500 ${cs}px Inter, system-ui, sans-serif`
    const cw = ctx.measureText(tile.credit).width
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillRect(half - cw - cs * 1.2, half - cs * 1.7, cw + cs * 1.2, cs * 1.7)
    ctx.fillStyle = '#333'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(tile.credit, half - cs * 0.6, half - cs * 0.85)
  }
  ctx.restore()
}
