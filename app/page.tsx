import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
import Chat from './chat';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getChatGPTUser();
 if(user)return <Chat/>;
 return <main className="signin"><div className="signin-art"><div className="brand"><span className="brand-mark">r</span>relay<span className="brand-dot">.</span></div><div className="signin-copy"><span className="eyebrow">A PLACE FOR YOUR TEAM</span><h1>会話から、<br/>次の一歩へ。</h1><p>チャンネルでアイデアを共有。<br/>DMで、気軽に声をかける。<br/>チームの会話が、ひとつにつながります。</p></div><span className="signin-footer">チームの毎日を、もう少し近くに。</span></div><section className="signin-form"><span className="brand-mark">r</span><h2>Relayへようこそ</h2><p>ログインして、チームの会話に参加しましょう。</p><a className="primary signin-button" href={chatGPTSignInPath('/')} target="_top">ChatGPTでログイン <span>→</span></a><p className="signin-note">このワークスペースへのアクセス権が必要です。<br/>DMの内容は、会話の参加者だけに表示されます。</p></section></main>;
}
