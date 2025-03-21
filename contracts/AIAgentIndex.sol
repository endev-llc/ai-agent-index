// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AIAgentIndex {
    struct Agent {
        string name;
        string wallet_address;  // Renamed from address_
        string socialLink;
        string profileUrl;
        string description;
        bool isActive;
        uint256 addedAt;
        address owner;
        uint256 lastUpdateTime;
        string admin_address;
    }
    
    struct SearchResult {
        uint256 id;
        Agent agent;
    }
    
    // Constants for validation
    uint256 public constant MAX_NAME_LENGTH = 100;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 5000;
    uint256 public constant MAX_URL_LENGTH = 500;
    uint256 public constant MIN_LISTING_FEE = 0; // Changed to 0
    
    // Storage layout (must maintain order for upgradability)
    address public owner;
    mapping(uint256 => Agent) public agents;
    uint256 public agentCount;
    uint256 public listingFee; // Keep this for storage layout compatibility
    address public feeCollector; // Keep this for storage layout compatibility
    
    // Search mappings
    mapping(string => uint256[]) private walletAddressToIds;
    mapping(string => uint256[]) private nameToIds;
    
    mapping(uint256 => address) public pendingAdmins;
    
    // Events
    event AgentAdded(uint256 indexed id, string name, uint256 timestamp, address indexed owner);
    event AgentUpdated(uint256 indexed id, string name, address indexed owner);
    event AgentDeactivated(uint256 indexed id, address indexed owner);
    event AgentReactivated(uint256 indexed id, address indexed owner);
    event FeeUpdated(uint256 newFee);
    event FeeCollectorUpdated(address newCollector);
    event AdminTransferRequested(uint256 indexed agentId, address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferred(uint256 indexed agentId, address indexed oldAdmin, address indexed newAdmin);
    
    bool private initialized;
    
    constructor() {
        owner = msg.sender;
    }
    
    function initialize(address _feeCollector, uint256 _listingFee) public {
        require(!initialized, "Contract already initialized");
        require(_feeCollector != address(0), "Invalid fee collector");
        // We keep this interface for backwards compatibility
        // but fees are now effectively disabled
        
        feeCollector = _feeCollector;
        listingFee = _listingFee; // Should be 0
        initialized = true;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    modifier onlyAgentOwner(uint256 _id) {
        require(_id < agentCount, "Agent does not exist");
        require(msg.sender == agents[_id].owner, "Only agent owner can modify");
        _;
    }
    
    modifier validString(string memory str, uint256 maxLength) {
        require(bytes(str).length > 0, "String cannot be empty");
        require(bytes(str).length <= maxLength, "String too long");
        _;
    }
    
    // Keep these fee-related functions for backward compatibility
    function setListingFee(uint256 _newFee) public onlyOwner {
        listingFee = _newFee;
        emit FeeUpdated(_newFee);
    }
    
    function setFeeCollector(address _newCollector) public onlyOwner {
        require(_newCollector != address(0), "Invalid fee collector");
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(_newCollector);
    }
    
    function addAgent(
        string memory _name,
        string memory _wallet_address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description,
        string memory _admin_address
    ) public payable 
      validString(_name, MAX_NAME_LENGTH)
      validString(_wallet_address, MAX_URL_LENGTH)
      validString(_socialLink, MAX_URL_LENGTH)
      validString(_profileUrl, MAX_URL_LENGTH)
      validString(_description, MAX_DESCRIPTION_LENGTH)
    returns (uint256) {
        // No longer require fee
        
        uint256 newAgentId = agentCount;
        agents[newAgentId] = Agent({
            name: _name,
            wallet_address: _wallet_address,
            socialLink: _socialLink,
            profileUrl: _profileUrl,
            description: _description,
            isActive: true,
            addedAt: block.timestamp,
            owner: msg.sender,
            lastUpdateTime: block.timestamp,
            admin_address: _admin_address
        });
        
        // Update search mappings
        walletAddressToIds[_wallet_address].push(newAgentId);
        nameToIds[_name].push(newAgentId);
        
        // Refund any sent value
        if (msg.value > 0) {
            (bool refundSent,) = msg.sender.call{value: msg.value}("");
            require(refundSent, "Failed to refund");
        }
        
        agentCount++;
        emit AgentAdded(newAgentId, _name, block.timestamp, msg.sender);
        return newAgentId;
    }
    
    function transferAgentAdmin(uint256 _agentId, address _newAdmin) public onlyAgentOwner(_agentId) {
        require(_newAdmin != address(0), "New admin cannot be zero address");
        require(_newAdmin != agents[_agentId].owner, "New admin cannot be current admin");
        
        pendingAdmins[_agentId] = _newAdmin;
        emit AdminTransferRequested(_agentId, agents[_agentId].owner, _newAdmin);
    }
    
    function acceptAgentAdmin(uint256 _agentId) public {
        require(msg.sender == pendingAdmins[_agentId], "Only pending admin can accept");
        require(agents[_agentId].owner != address(0), "Agent does not exist");
        
        address oldAdmin = agents[_agentId].owner;
        agents[_agentId].owner = msg.sender;
        agents[_agentId].admin_address = toAsciiString(msg.sender);
        delete pendingAdmins[_agentId];
        
        emit AdminTransferred(_agentId, oldAdmin, msg.sender);
    }
    
    function cancelAdminTransfer(uint256 _agentId) public onlyAgentOwner(_agentId) {
        require(pendingAdmins[_agentId] != address(0), "No pending admin transfer");
        delete pendingAdmins[_agentId];
    }
    
    function toAsciiString(address x) private pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }
    
    function char(bytes1 b) private pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
    
    function updateAgent(
        uint256 _id,
        string memory _name,
        string memory _wallet_address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description
    ) public onlyAgentOwner(_id)
      validString(_name, MAX_NAME_LENGTH)
      validString(_wallet_address, MAX_URL_LENGTH)
      validString(_socialLink, MAX_URL_LENGTH)
      validString(_profileUrl, MAX_URL_LENGTH)
      validString(_description, MAX_DESCRIPTION_LENGTH)
    {
        // Remove old search mappings
        _removeFromSearchMappings(_id);
        
        // Update agent
        agents[_id].name = _name;
        agents[_id].wallet_address = _wallet_address;
        agents[_id].socialLink = _socialLink;
        agents[_id].profileUrl = _profileUrl;
        agents[_id].description = _description;
        agents[_id].lastUpdateTime = block.timestamp;
        
        // Add new search mappings
        walletAddressToIds[_wallet_address].push(_id);
        nameToIds[_name].push(_id);
        
        emit AgentUpdated(_id, _name, msg.sender);
    }
    
    function deactivateAgent(uint256 _id) public onlyAgentOwner(_id) {
        require(agents[_id].isActive, "Agent already inactive");
        agents[_id].isActive = false;
        emit AgentDeactivated(_id, msg.sender);
    }
    
    function reactivateAgent(uint256 _id) public payable onlyAgentOwner(_id) {
        require(!agents[_id].isActive, "Agent already active");
        // No longer require fee
        
        agents[_id].isActive = true;
        agents[_id].lastUpdateTime = block.timestamp;
        
        // Refund any sent value
        if (msg.value > 0) {
            (bool refundSent,) = msg.sender.call{value: msg.value}("");
            require(refundSent, "Failed to refund");
        }
        
        emit AgentReactivated(_id, msg.sender);
    }
    
    // Rest of the functions remain the same
    function _removeFromSearchMappings(uint256 _id) private {
        Agent memory agent = agents[_id];
        
        // Remove from wallet address mapping
        uint256[] storage walletIds = walletAddressToIds[agent.wallet_address];
        for (uint256 i = 0; i < walletIds.length; i++) {
            if (walletIds[i] == _id) {
                walletIds[i] = walletIds[walletIds.length - 1];
                walletIds.pop();
                break;
            }
        }
        
        // Remove from name mapping
        uint256[] storage nameIds = nameToIds[agent.name];
        for (uint256 i = 0; i < nameIds.length; i++) {
            if (nameIds[i] == _id) {
                nameIds[i] = nameIds[nameIds.length - 1];
                nameIds.pop();
                break;
            }
        }
    }

    function isValidAddress(string memory _addr) internal pure returns (bool) {
        if (bytes(_addr).length != 42) return false;
        bytes memory b = bytes(_addr);
        if (b[0] != "0" || b[1] != "x") return false;
        for (uint i = 2; i < 42; i++) {
            bytes1 currentChar = b[i];
            if (!(currentChar >= "0" && currentChar <= "9") && 
                !(currentChar >= "a" && currentChar <= "f") &&
                !(currentChar >= "A" && currentChar <= "F")) return false;
        }
        return true;
    }

    function searchPaginated(
        string memory keyword,
        uint256 startIndex,
        uint256 pageSize
    ) public view returns (
        SearchResult[] memory results,
        uint256 nextStartIndex,
        bool hasMore
    ) {
        require(pageSize > 0 && pageSize <= 50, "Invalid page size");
        require(startIndex <= agentCount, "Start index out of bounds");

        results = new SearchResult[](pageSize);
        uint256 resultCount = 0;
        
        // Check if search term is an address
        bool isAddressSearch = isValidAddress(keyword);

        for (uint256 i = startIndex; i < agentCount && resultCount < pageSize; i++) {
            if (!agents[i].isActive) continue;
            
            if (quickContains(agents[i].name, keyword) ||
                quickContains(agents[i].wallet_address, keyword) ||
                quickContains(agents[i].socialLink, keyword) ||
                quickContains(agents[i].profileUrl, keyword) ||
                quickContains(agents[i].description, keyword) ||
                quickContains(agents[i].admin_address, keyword) ||
                (isAddressSearch && 
                 (keccak256(abi.encodePacked(toLowerCase(agents[i].admin_address))) == 
                 keccak256(abi.encodePacked(toLowerCase(keyword))) ||
                 keccak256(abi.encodePacked(toLowerCase(agents[i].wallet_address))) == 
                 keccak256(abi.encodePacked(toLowerCase(keyword)))))) {
                results[resultCount] = SearchResult(i, agents[i]);
                resultCount++;
            }
        }

        // Create properly sized array for actual results
        SearchResult[] memory finalResults = new SearchResult[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            finalResults[i] = results[i];
        }

        nextStartIndex = startIndex + pageSize;
        hasMore = nextStartIndex < agentCount;

        return (finalResults, nextStartIndex, hasMore);
    }

    function toLowerCase(string memory _str) internal pure returns (string memory) {
        bytes memory bStr = bytes(_str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint i = 0; i < bStr.length; i++) {
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }

    function quickContains(string memory source, string memory searchStr) private pure returns (bool) {
        bytes memory sourceBytes = bytes(source);
        bytes memory searchBytes = bytes(searchStr);
        
        if (searchBytes.length == 0 || sourceBytes.length < searchBytes.length) return false;
        
        for (uint i = 0; i < sourceBytes.length - searchBytes.length + 1; i++) {
            bool isMatch = true;
            for (uint j = 0; j < searchBytes.length; j++) {
                if (sourceBytes[i + j] != searchBytes[j]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) return true;
        }
        return false;
    }

    function getAgentsByOwner(
        address ownerAddress,
        uint256 startIndex,
        uint256 pageSize
    ) public view returns (
        SearchResult[] memory results,
        uint256 nextStartIndex,
        bool hasMore
    ) {
        require(pageSize > 0 && pageSize <= 50, "Invalid page size");
        require(startIndex <= agentCount, "Start index out of bounds");

        results = new SearchResult[](pageSize);
        uint256 resultCount = 0;
        
        for (uint256 i = startIndex; i < agentCount && resultCount < pageSize; i++) {
            if (agents[i].owner == ownerAddress) {
                results[resultCount] = SearchResult(i, agents[i]);
                resultCount++;
            }
        }

        SearchResult[] memory finalResults = new SearchResult[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            finalResults[i] = results[i];
        }

        nextStartIndex = startIndex + pageSize;
        hasMore = nextStartIndex < agentCount;

        return (finalResults, nextStartIndex, hasMore);
    }
    
    function getAgent(uint256 _id) public view returns (Agent memory) {
        require(_id < agentCount, "Agent does not exist");
        return agents[_id];
    }
}