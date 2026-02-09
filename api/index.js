export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const { message, callback_query } = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST || 'spotify-downloader9.p.rapidapi.com';

  const tgUrl = `https://api.telegram.org/bot${token}`;

  // Helper: Send Message
  const sendMessage = async (chatId, text, extra = {}) => {
    await fetch(`${tgUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
    });
  };

  // Helper: Send Audio
  const sendAudio = async (chatId, audioUrl, title, performer) => {
    await fetch(`${tgUrl}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, audio: audioUrl, title, performer }),
    });
  };

  // Helper: RapidAPI Request
  const rapidRequest = async (endpoint) => {
    const response = await fetch(`https://${rapidApiHost}${endpoint}`, {
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': rapidApiHost,
      },
    });
    return response.json();
  };

  try {
    // 1. Handle Search Request
    if (message && message.text) {
      const query = message.text;
      if (query === '/start') {
        await sendMessage(message.chat.id, 'Привет! 🗿 Напиши название песни, и я найду её для тебя.');
        return res.status(200).send('OK');
      }

      await sendMessage(message.chat.id, `🔍 Ищу: <b>${query}</b>...`);
      
      const results = await rapidRequest(`/search?q=${encodeURIComponent(query)}&type=multi&limit=5`);
      
      const tracks = results.data?.tracks?.items || [];
      
      if (tracks.length === 0) {
        await sendMessage(message.chat.id, 'Ничего не нашлось. Попробуй другое название.');
        return res.status(200).send('OK');
      }

      const buttons = tracks.map(track => ([{
        text: `🎵 ${track.name} - ${track.artists.items.map(a => a.profile.name).join(', ')}`,
        callback_data: `dl:${track.id}`
      }]));

      await sendMessage(message.chat.id, 'Выбери трек для загрузки:', {
        reply_markup: { inline_keyboard: buttons }
      });
    }

    // 2. Handle Download Request (Callback Query)
    if (callback_query) {
      const data = callback_query.data;
      const chatId = callback_query.message.chat.id;

      if (data.startsWith('dl:')) {
        const trackId = data.split(':')[1];
        
        await sendMessage(chatId, '⏳ Подготавливаю файл...');
        
        const dlResult = await rapidRequest(`/downloadSong?songId=${trackId}`);
        const trackData = dlResult.data;
        
        if (trackData && trackData.downloadLink) {
          await sendAudio(chatId, trackData.downloadLink, trackData.title, trackData.artist);
        } else {
          await sendMessage(chatId, 'Ошибка при получении ссылки на скачивание. 🗿');
        }
      }
      
      // Answer callback query to stop loading spinner
      await fetch(`${tgUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback_query.id }),
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }

  return res.status(200).send('OK');
}
