// A small phrasebook that is part of the app, so it works with no signal.
export type Phrase = { en: string; zh: string; py: string }

export const PHRASES: { group: string; items: Phrase[] }[] = [
  {
    group: 'Basics',
    items: [
      { en: 'Hello', zh: '你好', py: 'nǐ hǎo' },
      { en: 'Thank you', zh: '谢谢', py: 'xièxie' },
      { en: 'Excuse me / sorry', zh: '不好意思', py: 'bù hǎoyìsi' },
      { en: 'I don’t understand', zh: '我听不懂', py: 'wǒ tīng bù dǒng' },
      { en: 'Do you speak English?', zh: '你会说英语吗？', py: 'nǐ huì shuō Yīngyǔ ma?' },
      { en: 'Can you write it down?', zh: '请写下来', py: 'qǐng xiě xiàlái' },
      { en: 'We are from Belgium', zh: '我们是比利时人', py: 'wǒmen shì Bǐlìshí rén' },
      { en: 'Where is the toilet?', zh: '厕所在哪里？', py: 'cèsuǒ zài nǎlǐ?' },
      { en: 'Can you take a photo of us?', zh: '可以帮我们拍张照吗？', py: 'kěyǐ bāng wǒmen pāi zhāng zhào ma?' }
    ]
  },
  {
    group: 'Food',
    items: [
      { en: 'Do you have a table for us?', zh: '有位子吗？', py: 'yǒu wèizi ma?' },
      { en: 'The menu, please', zh: '请给我菜单', py: 'qǐng gěi wǒ càidān' },
      { en: 'I want this one', zh: '我要这个', py: 'wǒ yào zhège' },
      { en: 'Not spicy, please', zh: '不要辣', py: 'bú yào là' },
      { en: 'A little spicy', zh: '微辣', py: 'wēi là' },
      { en: 'I don’t eat meat', zh: '我不吃肉', py: 'wǒ bù chī ròu' },
      { en: 'I am allergic to peanuts', zh: '我对花生过敏', py: 'wǒ duì huāshēng guòmǐn' },
      { en: 'A cold beer, please', zh: '来一瓶冰啤酒', py: 'lái yì píng bīng píjiǔ' },
      { en: 'A bottle of water, please', zh: '请给我一瓶水', py: 'qǐng gěi wǒ yì píng shuǐ' },
      { en: 'Delicious!', zh: '很好吃！', py: 'hěn hǎochī!' },
      { en: 'Cheers!', zh: '干杯！', py: 'gānbēi!' },
      { en: 'The bill, please', zh: '买单', py: 'mǎidān' }
    ]
  },
  {
    group: 'Getting around',
    items: [
      { en: 'Please take me to this address', zh: '请带我去这个地址', py: 'qǐng dài wǒ qù zhège dìzhǐ' },
      { en: 'Please use the meter', zh: '请打表', py: 'qǐng dǎ biǎo' },
      { en: 'Please stop here', zh: '请在这里停', py: 'qǐng zài zhèlǐ tíng' },
      { en: 'How long does it take?', zh: '要多长时间？', py: 'yào duō cháng shíjiān?' },
      { en: 'Where is the metro station?', zh: '地铁站在哪里？', py: 'dìtiězhàn zài nǎlǐ?' },
      { en: 'Where is the train station?', zh: '火车站在哪里？', py: 'huǒchēzhàn zài nǎlǐ?' },
      { en: 'Where do I buy a ticket?', zh: '在哪里买票？', py: 'zài nǎlǐ mǎi piào?' }
    ]
  },
  {
    group: 'Shopping',
    items: [
      { en: 'How much is it?', zh: '多少钱？', py: 'duōshao qián?' },
      { en: 'Too expensive', zh: '太贵了', py: 'tài guì le' },
      { en: 'Can it be a bit cheaper?', zh: '可以便宜一点吗？', py: 'kěyǐ piányi yìdiǎn ma?' },
      { en: 'Can I pay with Alipay?', zh: '可以用支付宝吗？', py: 'kěyǐ yòng Zhīfùbǎo ma?' },
      { en: 'Can I pay cash?', zh: '可以付现金吗？', py: 'kěyǐ fù xiànjīn ma?' },
      { en: 'I am just looking', zh: '我只是看看', py: 'wǒ zhǐshì kànkan' },
      { en: 'No, thank you', zh: '不要，谢谢', py: 'bú yào, xièxie' }
    ]
  },
  {
    group: 'Emergency',
    items: [
      { en: 'Help!', zh: '救命！', py: 'jiùmìng!' },
      { en: 'I need a doctor', zh: '我需要看医生', py: 'wǒ xūyào kàn yīshēng' },
      { en: 'Please call the police', zh: '请报警', py: 'qǐng bàojǐng' },
      { en: 'I am lost', zh: '我迷路了', py: 'wǒ mílù le' },
      { en: 'I lost my passport', zh: '我的护照丢了', py: 'wǒ de hùzhào diū le' },
      { en: 'Where is a pharmacy?', zh: '药店在哪里？', py: 'yàodiàn zài nǎlǐ?' }
    ]
  }
]
