/* JavaScript ฝั่งเบราว์เซอร์: ฟอร์มที่มี data-confirm จะถามยืนยันก่อนส่ง */
document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit',
  event => {

    /* หากกดยกเลิกให้หยุดส่งฟอร์ม; การตรวจสิทธิ์จริงยังอยู่ฝั่งเซิร์ฟเวอร์ */
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  }));
