let account = "300760994454437899";
export const myId = () => account;
export const switchHistoryAccount = () => { account = "300760994454437898"; };
export const stores: any = { users: {getUser:()=>({username:"Alex",avatar:null})},profiles:{getUserProfile:()=>({bio:"baseline"})},presences:{getStatus:()=>"online"},messages:{getMessage:()=>null} };
