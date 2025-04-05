var botones =document.getElementsByClassName("deviceButton");
for (let item of botones) {
    let texto = item.getElementsByClassName('deviceStatus');
    let status = texto[0].innerText;
    if (status == 'on') {
        item.setAttribute('style','color: rgb(0, 173, 181)')
    }else{
        item.setAttribute('style','color: rgb(34, 40, 49)')
    }
   
}