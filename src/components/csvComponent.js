import * as XLSX from "xlsx";
import { CSVLink } from "react-csv";
import { useState, useRef } from "react";
import axios from "axios";
import rateLimit from "axios-rate-limit";

function CsvComponent() {
  const [csvData, setData] = useState([]);
  const [finalAddressData, setfinalAddressData] = useState([]);
  const csvLink = useRef();
  const [wordings, setWordings] = useState("");
  const [loader, setLoader] = useState(false);
  const [error, setError] = useState("");
  const headers = [
    { label: "Pincode", key: "pincode" },
    { label: "Name of Post Office", key: "name" },
    { label: "District", key: "district" },
    { label: "State", key: "state" },
    { label: "Delivery", key: "delivery" },
  ];
  const [fileName, setFileName] = useState("data.csv");
  const processData = (dataString) => {
    const dataStringLines = dataString.split(/\r\n|\n/);
    setData(dataStringLines);
  };

  // This function handles the upload of csv file and converting the data to JSON
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      /* Parse data */
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_csv(ws, { header: 1 });
      processData(data);
    };
    // This will read the contents of the csv file
    reader.readAsBinaryString(file);
  };

  // This function handles the download of csv file converted from JSON
  const handleFileDownload = async (e) => {
    try {
      e.preventDefault();
      setError(false);
      setLoader(true);
      setWordings("");
      let addressData = [];
      let deliveryData = [];
      let errorNos = 0;
      let successNos = 0;
      let errorList = [];
      let setLimitReached = false;

      //Setting maximum rate limit as 120 RPS which means in total 120 requests will be handled in a sec.
      const http = rateLimit(axios.create(), { maxRPS: 120 });
      for (let i = 0; i < csvData.length; i = i + 60) {
        const request_chunk1 = [];
        const request_chunk2 = [];
        for (
          let index = i + 1;
          index <= i + 60 && index < csvData.length;
          index++
        ) {
          request_chunk1.push(
            http.get(
              `https://api.postalpincode.in/pincode/${csvData[index - 1]}`
            )
          );
          request_chunk2.push(
            http.get(
              `https://api.giva.co/getDeliveryTime?pin=${csvData[index - 1]}`
            )
          );
          if (index === csvData.length || index === csvData.length - 1)
            setLimitReached = true;
        }
        [addressData, deliveryData] = await Promise.all([
          addressData.concat(await Promise.all(request_chunk1)),
          deliveryData.concat(await Promise.all(request_chunk2)),
        ]);
        // deliveryData = deliveryData.concat(await Promise.all(request_chunk2));
        if (!setLimitReached)
          setWordings(`Processed ${i + 60} of ${csvData.length} pincodes`);
        else {
          setWordings(`Processed all pincodes `);
        }
      }
      let updatedAddressData = addressData.map((data, index) => {
        let successList = [];
        if (data && data.data && data.data[0] && data.data[0].PostOffice) {
          data.data[0].PostOffice.forEach((singleData) => {
            successList.push(singleData.Name);
          });
        } else successList.push(null);
        let postOffices = successList.toString();
        if (
          data &&
          data.data &&
          data.data[0] &&
          data.data[0].PostOffice &&
          data.data[0].PostOffice[0]
        ) {
          return {
            pincode: data.data[0].PostOffice[0].Pincode || null,
            state: data.data[0].PostOffice[0].State || null,
            district: data.data[0].PostOffice[0].District || null,
            name: postOffices,
            delivery: deliveryData[index].data.message || null,
          };
        } else {
          // errorList gives the list of pincodes that are not processed
          errorList.push(csvData[index]);
          return {
            pincode: null,
            state: null,
            district: null,
            name: null,
            delivery: null,
          };
        }
      });
      let addressAndDeliveryData = updatedAddressData.map((item, i) =>
        Object.assign({}, item, deliveryData[i])
      );
      let filtered = addressAndDeliveryData.filter(function (el) {
        return el.pincode !== null;
      });
      setfinalAddressData(addressAndDeliveryData);
      successNos = filtered.length;
      errorNos = csvData.length - successNos - 1;
      let errorString = errorList.toString();
      setFileName(`${Date.now()}-${successNos}-${errorNos}.csv`);
      setError(`Pincode(s) ${errorString} could not be processed`);
      setLoader(false);
      csvLink.current.link.click();
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <div>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
      <br />
      {csvData.length > 0 ? (
        <button onClick={handleFileDownload} disabled={loader}>
          Convert
        </button>
      ) : null}
      <br />
      {wordings !== "" ? wordings : null}
      <br />
      <CSVLink
        data={finalAddressData}
        headers={headers}
        target="_blank"
        ref={csvLink}
        className="hidden"
        filename={fileName}
      ></CSVLink>
      {}
      {loader ? <div class="loader"></div> : null}
      {error !== "" ? <div>{error}</div> : null}
    </div>
  );
}

export default CsvComponent;
