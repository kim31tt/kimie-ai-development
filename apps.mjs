// Add a catalog entry and a corresponding app directory to extend the portal.
// href is a same-origin app root; each app owns its routes beneath this path.
export const apps = [
  {
    id: 'chat-todo',
    name: 'Chat & Todo',
    category: 'COMMUNICATION & TASKS',
    description: '相手ごとの会話と、そこから生まれるTodo。\n案件のやり取りを、次のアクションにつなげます。',
    href: '/chat-todo/',
    tags: ['案件チャット', 'タスク管理'],
    icon: 'chat',
  },
  {id:'work-records',name:'業務記録',category:'PERSONAL WORK LOG',description:'日々の業務と気づきを、自分のために記録。\nこのブラウザに保存して、仕事を振り返ります。',href:'/work-records/',tags:['個人記録','日々の振り返り'],icon:'record'},
];
