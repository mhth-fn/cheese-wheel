export const MUSIC_TYPES = [
  { value: 'track', icon: '🎵', label: 'Трек' },
  { value: 'album', icon: '💿', label: 'Альбом' },
  { value: 'artist', icon: '🎤', label: 'Исполнитель' },
  { value: 'playlist', icon: '🎧', label: 'Плейлист' },
  { value: 'live', icon: '🎙️', label: 'Концерт' },
];

export const EMPTY_MUSIC_REVIEW = {
  artist: '',
  content: '',
  musicType: 'track',
  recommend: 1,
  sourceUrl: '',
  title: '',
};

export function getMusicType(value) {
  return MUSIC_TYPES.find(item => item.value === value) || MUSIC_TYPES[0];
}

export function getMusicSourceLabel(value) {
  if (!value) return 'Открыть находку';
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    if (host.includes('music.yandex')) return 'Открыть в Яндекс Музыке';
    if (host.includes('spotify')) return 'Открыть в Spotify';
    if (host.includes('youtube') || host === 'youtu.be') return 'Открыть в YouTube';
    if (host.includes('soundcloud')) return 'Открыть в SoundCloud';
    if (host.includes('bandcamp')) return 'Открыть в Bandcamp';
    if (host.includes('vk.com')) return 'Открыть во ВКонтакте';
  } catch {
    // Сервер всё равно отбрасывает небезопасные и некорректные ссылки.
  }
  return 'Открыть находку';
}
