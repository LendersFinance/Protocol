pragma solidity >0.8.0;

import "./libraries/Math.sol";
import "./libraries/WadRayMaths.sol";
import "./interfaces/IDataProvider.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IunERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract InterestRateStatergy is Math {
    using SafeMath for uint256;

    using WadRayMath for uint256;

    uint256 internal constant WAD = 1e18;

    IDataProvider dataProvider;
    uint256 securityPercentage;

    function initialize(IDataProvider addr, uint256 _securityPercentage)
        public
    {
        dataProvider = addr;
        securityPercentage = _securityPercentage;
    }

    function calculatePaymentAmount(
        IERC20 token,
        uint256 amount,
        uint256 numberOfDays
    ) external view returns (uint256, uint256) {
        IUNERC20 tokenProxy = IUNERC20(dataProvider.getContractAddress(token));
        // int256 price = dataProvider.getThePrice(0xF9680D99D6C9589e2a93a78A04A279e509205945);
        uint256 interest = calculateInterest(amount, tokenProxy);
        uint256 security = calculateSecurity(amount, numberOfDays);
        return (interest, security);
    }

    // amount in wad
    function calculateInterest(uint256 amount, IUNERC20 tokenProxy)
        internal
        view
        returns (uint256)
    {
        // y = ymax - sqrt(ymax^2 - (x^2 * (ymax -ymin)^2 - ymin^2 + 2ymaxymin))
        (uint256 ymax, uint256 ymin, uint256 B, uint256 T) =
            dataProvider.getValuesForInterestCalculation(tokenProxy);

        uint256 x = (B.add(amount)).wadDiv(T);
        uint256 m = (ymax.sub(ymin));

        if (x < WAD / 10) {
            m = m.mul(10 * WAD).wadDiv(100 * WAD);
        } else {
            m = m.mul(80 * WAD).wadDiv(100 * WAD);
        }

        uint256 y = m.wadMul(x) + (ymin * WAD);
        return y;
    }

    function calculateSecurity(uint256 amount, uint256 numberOfDays)
        internal
        view
        returns (uint256)
    {
        return amount.mul(securityPercentage).mul(numberOfDays).div(100);
    }
}
