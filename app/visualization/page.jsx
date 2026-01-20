'use client';

import { useState } from 'react';

export default function Page() {
  const [step, setStep] = useState('upload');
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [columnInputs, setColumnInputs] = useState({});
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [mappedData, setMappedData] = useState([]);
  const [actuals, setActuals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handlers
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
  
    setLoading(true);
    setError(null);
  
    try {
      const allData = [];
      const columnsByFile = [];
      
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        const jsonData = csvToJson(text);
        
        // Add file data to collection
        allData.push({
          fileName: file.name,
          data: jsonData
        });
        
        // Store columns for this specific file
        if (jsonData.length > 0) {
          const fileCols = Object.keys(jsonData[0]);
          columnsByFile.push({
            fileName: file.name,
            columns: fileCols
          });
        }
      }
      
      setData(allData);
      setColumns(columnsByFile);
      
      // Initialize input values for each column from all files
      const initialInputs = [];
      columnsByFile.forEach(fileGroup => {
        fileGroup.columns.forEach(col => {
          // Use a unique key combining file name and column name
          const key = `${fileGroup.fileName}:${col}`;
          initialInputs[key] = {
            oldName:col,
            newName: '',
            ignore: false
          };
        });
      });
      setColumnInputs(initialInputs);
      let categories = Array.from(new Set(allData[0].data.map(d => d.Category))).filter(r => r != "");
      setCategories(categories);
      let budgets = {};
      categories.forEach(c => {
        budgets[c] = 0;
      });
      setBudgets(budgets);
    } catch (err) {
      setError(err.message);
      console.error('Error reading files:', err);
    } finally {
      setLoading(false);
    }
  };
  const handleInputChange = (column, value, field = 'newName') => {
    setColumnInputs(prev => ({
      ...prev,
      [column]: {
        ...prev[column],
        [field]: value
      }
    }));
  };
  const handleBudgetChange = (category, value) => {
    setBudgets(prev => ({
    ...prev,
    [category]: value === '' ? 0 : parseFloat(value) || 0
  }));
  }
  const handleContinue = () => {
    const mapped = processFileData(data, columnInputs);
    setMappedData(mapped);
    setStep("table");
  };
  const handleBack = () => {
    setStep("upload");
  };
  // Process files
  const csvToJson = (csvText) => {
    const lines = csvText.trim().split('\n');
    // Detect delimiter by checking the first line
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';
    // Parse headers
    const headers = parseCSVLine(lines[0], delimiter).map(h => h.trim());
    // Parse data rows
    const jsonData = lines.slice(1).map(line => {
      const values = parseCSVLine(line, delimiter);
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index]?.trim() || '';
      });
      return obj;
    });
    return jsonData;
  };
  const processFileData = (fileData, cols) => {
    let rows = fileData[0].data;
    let columns = Object.values(columnInputs).filter(c => !c.ignore);
    let mappedData = rows.filter(r => r["Value date"] != "").map(row => {
      let mapObj = {};
      columns.forEach(col => {
        mapObj[col.newName] = row[col.oldName];
      });
      return mapObj;
    });
    let actuals = categories.map(c => {
      let total = mappedData.filter(r => r["Category"] == c).map(r => parseFloat(r["Amount"])).reduce((acc, val) => acc + val, 0);
      return  {
        "category":c,
        "budget":budgets[c],
        "total":Math.abs(total),
        "delta":Math.abs(budgets[c])-Math.abs(total)
      };
    });
    setActuals(actuals);
    return mappedData;
  }
  // Helper function to parse a CSV line handling quoted fields
  const parseCSVLine = (line, delimiter) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Handle escaped quotes ("")
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // Found delimiter outside quotes
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Push the last field
    result.push(current);
    
    return result;
  };
  return (
    <div className="flex flex-col items-center min-h-full gap-4">
      {step === "upload" && (
        <div className="flex flex-col items-center min-h-full gap-4">
        <h1 className="text-2xl font-bold">Transaction Summary</h1>
        <h2 className="text-lg">Upload statements to get started</h2>
        
        <input 
          className="w-1/2 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          type="file" 
          accept=".csv"
          onChange={handleFileUpload}
          multiple
        />
  
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
        
        {data && data.length > 0 && (
          <div className="mt-4 w-full max-w-2xl">
            <div className="w-full max-w-2xl flex justify-end">
              <button
                onClick={handleContinue}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
            <p className="text-green-500 mb-4">
              Successfully loaded {data.length} file{data.length > 1 ? 's' : ''}
            </p>
            <div className="mb-4 text-sm text-gray-400">
              {data.map((fileData, index) => (
                <div key={index}>
                  {fileData.fileName}: {fileData.data.length} rows
                </div>
              ))}
            </div>          
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Columns:</h3>
              <h4>Enter the name of the new mapped column or click ignore.</h4>
              {columns.map((fileGroup, fileIndex) => (
                <div key={fileIndex} className="mb-6 last:mb-0">
                  <h4 className="text-lg font-semibold text-blue-400 mb-3 px-2">
                    {fileGroup.fileName}
                  </h4>
                  <table key={"colsTable"} className="w-full bg-gray-700 rounded-lg overflow-hidden mb-4">
                    <tbody>
                      {fileGroup.columns.map((column, colIndex) => {
                        const key = `${fileGroup.fileName}:${column}`;
                        return (
                          <tr key={colIndex} className="border-b border-gray-600 last:border-b-0">
                            <td className="px-4 py-3 font-medium">{column}</td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={columnInputs[key]?.newName || ''}
                                onChange={(e) => handleInputChange(key, e.target.value, 'newName')}
                                placeholder="Enter value..."
                                disabled={columnInputs[key]?.ignore || false}
                                className={`bg-gray-600 px-3 py-1 rounded w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  columnInputs[key]?.ignore ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              />
                            </td>
                            <td className="flex items-center gap-2 p-4">
                              <span>Ignore?</span>
                              <input
                                type="checkbox"
                                checked={columnInputs[key]?.ignore || false}
                                onChange={(e) => handleInputChange(key, e.target.checked, 'ignore')}
                                className="accent-blue-600 w-5 h-5 cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {fileIndex < columns.length - 1 && (
                    <div className="border-t-2 border-gray-500 my-4"></div>
                  )}
                </div>
              ))}
              <div className='mb-3'><h3>Budget Categories</h3></div>
                <table key={"budgetsTable"} className="w-full bg-gray-700 rounded-lg overflow-hidden mb-4">
                  <tbody>             
                    {categories.map((category,idx) =>
                    <tr key={idx} className="border-b border-gray-600 last:border-b-0">
                      <td className="px-4 py-3 font-medium">{category}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={budgets[category] || ''}
                          onChange={(e) => handleBudgetChange(category, e.target.value)}
                          placeholder="100"
                          className={`bg-gray-600 px-3 py-1 rounded w-full focus:outline-none focus:ring-2 focus:ring-blue-500 `}
                        />
                      </td>
                    </tr>
                  )}
                  </tbody>
                </table>
            </div>
          </div>
        )}
      </div>
      )}
      {step === 'table' && (
        <>
          <div className="w-full max-w-4xl">
            <button
              onClick={handleBack}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors mb-4"
            >
              ← Back
            </button>

            <h1 className="text-2xl font-bold mb-4 text-center">Transaction Summary</h1>
            
            <div className="bg-gray-800 p-4 rounded-lg overflow-auto">
              <h2 className="text-center font-bold mb-2">Expected and Actual Values</h2>
              <table className="w-full bg-gray-700 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-600">
                    <th>Category Name</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {actuals.map((a, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-gray-600 last:border-b-0">
                      {Object.values(a).map((value, colIdx) => (
                        <td key={colIdx} className="px-4 py-3">{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2 className="text-center font-bold m-2">Transactions</h2>
              <table className="w-full bg-gray-700 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-600">
                    {mappedData.length > 0 && Object.keys(mappedData[0]).map((col, idx) => (
                      <th key={idx} className="px-4 py-3 text-left">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedData.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-gray-600 last:border-b-0">
                      {Object.values(row).map((value, colIdx) => (
                        <td key={colIdx} className="px-4 py-3">{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}