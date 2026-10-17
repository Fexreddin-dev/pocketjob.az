export const CATEGORIES = [
  { id: 'logistics', label: 'Yükdaşıma və fiziki iş', short: 'Yükdaşıma' },
  { id: 'retail', label: 'Satış və kassa', short: 'Satış' },
  { id: 'food', label: 'Restoran və kafe', short: 'Restoran' },
  { id: 'delivery', label: 'Kuryer və çatdırılma', short: 'Kuryer' },
  { id: 'cleaning', label: 'Təmizlik', short: 'Təmizlik' },
  { id: 'security', label: 'Mühafizə', short: 'Mühafizə' },
  { id: 'events', label: 'Tədbir və promouter', short: 'Tədbir' },
  { id: 'office', label: 'Ofis və köməkçi iş', short: 'Ofis' },
  { id: 'other', label: 'Digər', short: 'Digər' },
];

export const CITIES = ['Bakı', 'Sumqayıt', 'Xırdalan', 'Gəncə', 'Digər'];

export const PAY_UNITS = [
  { id: 'negotiable', label: 'Razılaşma ilə' },
  { id: 'total', label: 'Cəmi məbləğ' },
  { id: 'hour', label: 'Saatlıq' },
];

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam və ya təkrar elan' },
  { id: 'fraud', label: 'Aldatma və ya dələduzluq' },
  { id: 'wrong', label: 'Yanlış və ya köhnəlmiş məlumat' },
  { id: 'other', label: 'Digər' },
];

export const EXAMPLES = [
  'Sabah saat 15-dən 19-a qədər Neftçilər metrosunda yükdaşıyan lazımdır, 30 manat, 055 123 45 67',
  'Bu gün 18:00-dan 23:00-a kimi kafeyə ofisiant axtarılır, saatı 5 manat. Nömrə: 0507654321',
  'Sumqayıtda mağazaya kassir lazımdır, ayın 20-də, 40 AZN, 077 555 12 34',
];

export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Digər';
export const catShort = (id) => CATEGORIES.find((c) => c.id === id)?.short ?? 'Digər';
