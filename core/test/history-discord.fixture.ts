let account = "300760994454437899";
export const myId = () => account;
export const switchHistoryAccount = (id="300760994454437898") => { account = id; };
export const stores: any = { users: {getUser:()=>({username:"Alex",avatar:null})},profiles:{getUserProfile:()=>({bio:"baseline"})},presences:{getStatus:()=>"online"},messages:{getMessage:()=>null} };
