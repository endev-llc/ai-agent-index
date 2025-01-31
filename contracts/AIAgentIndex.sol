// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Proxy contract for upgradability
contract AIAgentIndexProxy {
    address public implementation;
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    function upgradeTo(address newImplementation) public onlyOwner {
        implementation = newImplementation;
    }
    
    fallback() external payable {
        address _impl = implementation;
        require(_impl != address(0), "Implementation not set");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}
}

contract AIAgentIndex {
    struct Agent {
        string name;
        string address_;
        string socialLink;
        string profileUrl;
        string description;
        bool isActive;
        uint256 addedAt;
        address owner;         // Owner of this agent entry
        uint256 lastUpdateTime;
    }
    
    struct SearchResult {
        uint256 id;
        Agent agent;
    }
    
    // Constants for validation
    uint256 public constant MAX_NAME_LENGTH = 100;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 2000;
    uint256 public constant MAX_URL_LENGTH = 500;
    uint256 public constant MIN_LISTING_FEE = 0.0001 ether;
    
    // Storage layout (must maintain order for upgradability)
    address public owner;
    mapping(uint256 => Agent) public agents;
    uint256 public agentCount;
    uint256 public listingFee;
    address public feeCollector;
    
    // Additional mappings for search functionality
    mapping(string => uint256[]) private addressToIds;
    mapping(string => uint256[]) private nameToIds;
    
    event AgentAdded(uint256 indexed id, string name, uint256 timestamp, address indexed owner);
    event AgentUpdated(uint256 indexed id, string name, address indexed owner);
    event AgentDeactivated(uint256 indexed id, address indexed owner);
    event AgentReactivated(uint256 indexed id, address indexed owner);
    event FeeUpdated(uint256 newFee);
    event FeeCollectorUpdated(address newCollector);
    
    constructor() {
        owner = msg.sender;
        feeCollector = msg.sender;
        listingFee = MIN_LISTING_FEE;
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
        require(_containsValidChars(str), "Invalid characters in string");
        _;
    }
    
    function setListingFee(uint256 _newFee) public onlyOwner {
        require(_newFee >= MIN_LISTING_FEE, "Fee too low");
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
        string memory _address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description
    ) public payable 
      validString(_name, MAX_NAME_LENGTH)
      validString(_address, MAX_URL_LENGTH)
      validString(_socialLink, MAX_URL_LENGTH)
      validString(_profileUrl, MAX_URL_LENGTH)
      validString(_description, MAX_DESCRIPTION_LENGTH)
    returns (uint256) {
        require(msg.value >= listingFee, "Insufficient listing fee");
        
        uint256 newAgentId = agentCount;
        agents[newAgentId] = Agent({
            name: _name,
            address_: _address,
            socialLink: _socialLink,
            profileUrl: _profileUrl,
            description: _description,
            isActive: true,
            addedAt: block.timestamp,
            owner: msg.sender,
            lastUpdateTime: block.timestamp
        });
        
        // Update search mappings
        addressToIds[_address].push(newAgentId);
        nameToIds[_name].push(newAgentId);
        
        // Transfer fee
        (bool sent,) = feeCollector.call{value: listingFee}("");
        require(sent, "Fee transfer failed");
        
        // Refund excess
        if (msg.value > listingFee) {
            (bool refundSent,) = msg.sender.call{value: msg.value - listingFee}("");
            require(refundSent, "Failed to refund excess");
        }
        
        agentCount++;
        emit AgentAdded(newAgentId, _name, block.timestamp, msg.sender);
        return newAgentId;
    }
    
    function updateAgent(
        uint256 _id,
        string memory _name,
        string memory _address,
        string memory _socialLink,
        string memory _profileUrl,
        string memory _description
    ) public onlyAgentOwner(_id)
      validString(_name, MAX_NAME_LENGTH)
      validString(_address, MAX_URL_LENGTH)
      validString(_socialLink, MAX_URL_LENGTH)
      validString(_profileUrl, MAX_URL_LENGTH)
      validString(_description, MAX_DESCRIPTION_LENGTH)
    {
        // Remove old search mappings
        _removeFromSearchMappings(_id);
        
        // Update agent
        agents[_id].name = _name;
        agents[_id].address_ = _address;
        agents[_id].socialLink = _socialLink;
        agents[_id].profileUrl = _profileUrl;
        agents[_id].description = _description;
        agents[_id].lastUpdateTime = block.timestamp;
        
        // Add new search mappings
        addressToIds[_address].push(_id);
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
        require(msg.value >= listingFee, "Insufficient fee");
        
        agents[_id].isActive = true;
        agents[_id].lastUpdateTime = block.timestamp;
        
        // Transfer fee
        (bool sent,) = feeCollector.call{value: listingFee}("");
        require(sent, "Fee transfer failed");
        
        // Refund excess
        if (msg.value > listingFee) {
            (bool refundSent,) = msg.sender.call{value: msg.value - listingFee}("");
            require(refundSent, "Failed to refund excess");
        }
        
        emit AgentReactivated(_id, msg.sender);
    }
    
    function _removeFromSearchMappings(uint256 _id) private {
        Agent memory agent = agents[_id];
        
        // Remove from address mapping
        uint256[] storage addressIds = addressToIds[agent.address_];
        for (uint256 i = 0; i < addressIds.length; i++) {
            if (addressIds[i] == _id) {
                addressIds[i] = addressIds[addressIds.length - 1];
                addressIds.pop();
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
    
    function _containsValidChars(string memory str) internal pure returns (bool) {
        bytes memory b = bytes(str);
        for(uint i; i < b.length; i++) {
            bytes1 char = b[i];
            if(!(char >= 0x20 && char <= 0x7E)) return false; // Only printable ASCII
        }
        return true;
    }
    
    // Existing search functions remain unchanged
    function searchByAddress(string memory _address) public view returns (SearchResult[] memory) {
        uint256[] memory ids = addressToIds[_address];
        return _buildSearchResults(ids);
    }
    
    function searchByName(string memory _name) public view returns (SearchResult[] memory) {
        uint256[] memory ids = nameToIds[_name];
        return _buildSearchResults(ids);
    }
    
    function searchByKeyword(string memory keyword) public view returns (SearchResult[] memory) {
        SearchResult[] memory results = new SearchResult[](agentCount);
        uint256 resultCount = 0;
        
        for (uint256 i = 0; i < agentCount; i++) {
            Agent memory agent = agents[i];
            if (agent.isActive &&
                (_containsIgnoreCase(agent.name, keyword) ||
                 _containsIgnoreCase(agent.description, keyword) ||
                 _containsIgnoreCase(agent.socialLink, keyword) ||
                 _containsIgnoreCase(agent.profileUrl, keyword))) {
                results[resultCount] = SearchResult(i, agent);
                resultCount++;
            }
        }
        
        SearchResult[] memory trimmedResults = new SearchResult[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            trimmedResults[i] = results[i];
        }
        
        return trimmedResults;
    }
    
    function _containsIgnoreCase(string memory source, string memory search) private pure returns (bool) {
        bytes memory sourceBytes = bytes(source);
        bytes memory searchBytes = bytes(search);
        
        if (searchBytes.length > sourceBytes.length) return false;
        
        for (uint i = 0; i <= sourceBytes.length - searchBytes.length; i++) {
            bool found = true;
            for (uint j = 0; j < searchBytes.length; j++) {
                bytes1 sourceChar = sourceBytes[i + j];
                bytes1 searchChar = searchBytes[j];
                
                if ((sourceChar >= 0x41 && sourceChar <= 0x5A) && (searchChar >= 0x41 && searchChar <= 0x5A)) {
                    if (sourceChar != searchChar) {
                        found = false;
                        break;
                    }
                } else if ((sourceChar >= 0x41 && sourceChar <= 0x5A) && (searchChar >= 0x61 && searchChar <= 0x7A)) {
                    if (sourceChar != (searchChar - 32)) {
                        found = false;
                        break;
                    }
                } else if ((sourceChar >= 0x61 && sourceChar <= 0x7A) && (searchChar >= 0x41 && searchChar <= 0x5A)) {
                    if (sourceChar != (searchChar + 32)) {
                        found = false;
                        break;
                    }
                } else {
                    if (sourceChar != searchChar) {
                        found = false;
                        break;
                    }
                }
            }
            if (found) return true;
        }
        return false;
    }
    
    function _buildSearchResults(uint256[] memory ids) private view returns (SearchResult[] memory) {
        SearchResult[] memory results = new SearchResult[](ids.length);
        uint256 resultCount = 0;
        
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] < agentCount && agents[ids[i]].isActive) {
                results[resultCount] = SearchResult(ids[i], agents[ids[i]]);
                resultCount++;
            }
        }
        
        return results;
    }
    
    function getAgent(uint256 _id) public view returns (Agent memory) {
        require(_id < agentCount, "Agent does not exist");
        return agents[_id];
    }
}