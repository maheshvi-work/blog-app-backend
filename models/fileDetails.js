const mongoose = require("mongoose");

const PdfDetailsSchema = new mongoose.Schema(
  {
    pdf: String,
    title: String,
    content:String,
    username_:String,
    accesslevel:String,
  },
  { collection: "PdfDetails" }
);

const FileModel=mongoose.model("pdfDetails", PdfDetailsSchema);

module.exports=FileModel;